import * as Y from 'yjs';
import {
  STORE_DOCS,
  STORE_UPDATES,
  describeError,
  runTx,
  type DocRow,
  type UpdateRecord,
} from './idb';

export type SaveState =
  | { kind: 'loading' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

export interface PersistenceOptions {
  /** Nº de registros de actualización a partir del cual se compacta. */
  compactThreshold?: number;
}

const DEFAULT_COMPACT_THRESHOLD = 200;

export function readTitle(ydoc: Y.Doc): string {
  const t = ydoc.getMap('meta').get('title');
  return typeof t === 'string' ? t : '';
}

/**
 * Persiste un Y.Doc como un registro append-only de actualizaciones.
 *
 * Garantía: el estado pasa a 'saved' únicamente cuando la transacción de
 * IndexedDB que contiene todas las actualizaciones pendientes se ha completado.
 * Si una escritura falla, las actualizaciones se conservan en memoria y se
 * reintentan JUNTAS (nunca se escribe una posterior dejando un hueco antes).
 *
 * Límite: "completado" significa lo que el navegador reporta como transacción
 * confirmada; no podemos garantizar que el SO haya volcado a disco.
 */
export class DocPersistence {
  private unsaved: Uint8Array[] = [];
  private chain: Promise<void> = Promise.resolve();
  private scheduled = false;
  private storedCount = 0;
  private state: SaveState = { kind: 'loading' };
  private listeners = new Set<(s: SaveState) => void>();
  private readonly compactThreshold: number;

  constructor(
    private readonly getDb: () => IDBDatabase,
    readonly docId: string,
    readonly ydoc: Y.Doc,
    opts: PersistenceOptions = {},
  ) {
    this.compactThreshold = opts.compactThreshold ?? DEFAULT_COMPACT_THRESHOLD;
  }

  private readonly onUpdate = (update: Uint8Array, origin: unknown): void => {
    if (origin === this) return; // viene de la propia carga desde disco
    this.unsaved.push(update);
    this.setState({ kind: 'saving' });
    this.schedule();
  };

  getState(): SaveState {
    return this.state;
  }

  subscribe(cb: (s: SaveState) => void): () => void {
    this.listeners.add(cb);
    cb(this.state);
    return () => this.listeners.delete(cb);
  }

  async load(): Promise<void> {
    const records = await runTx<UpdateRecord[]>(
      this.getDb(),
      [STORE_UPDATES],
      'readonly',
      (tx, set) => {
        const req = tx.objectStore(STORE_UPDATES).index('byDoc').getAll(this.docId);
        req.onsuccess = () => set(req.result as UpdateRecord[]);
      },
    );
    this.ydoc.transact(() => {
      for (const r of records) Y.applyUpdate(this.ydoc, r.update, this);
    }, this);
    this.storedCount = records.length;
    this.ydoc.on('update', this.onUpdate);
    this.setState({ kind: 'saved' });
  }

  /** Fuerza la escritura de lo pendiente y devuelve el estado resultante. */
  async flush(): Promise<SaveState> {
    await this.enqueueFlush();
    return this.state;
  }

  /** Reintenta tras un error (p. ej. cuando el usuario pulsa «Reintentar»). */
  retry(): Promise<SaveState> {
    return this.flush();
  }

  async close(): Promise<SaveState> {
    const final = await this.flush();
    this.ydoc.off('update', this.onUpdate);
    return final;
  }

  private setState(next: SaveState): void {
    this.state = next;
    for (const cb of this.listeners) cb(next);
  }

  private schedule(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      void this.enqueueFlush();
    });
  }

  private enqueueFlush(): Promise<void> {
    this.chain = this.chain.then(() => this.flushOnce());
    return this.chain;
  }

  /** Nunca lanza: los errores se reflejan en el estado. */
  private async flushOnce(): Promise<void> {
    if (this.unsaved.length === 0) return;
    const batch = this.unsaved;
    this.unsaved = [];
    const merged = batch.length === 1 ? (batch[0] as Uint8Array) : Y.mergeUpdates(batch);
    try {
      await this.writeUpdate(merged);
      this.storedCount += 1;
    } catch (e) {
      this.unsaved = [...batch, ...this.unsaved];
      this.setState({ kind: 'error', message: describeError(e) });
      return;
    }
    if (this.unsaved.length === 0) this.setState({ kind: 'saved' });
    if (this.storedCount >= this.compactThreshold) await this.compact();
  }

  private writeUpdate(update: Uint8Array): Promise<void> {
    const title = readTitle(this.ydoc);
    const now = Date.now();
    return runTx(this.getDb(), [STORE_DOCS, STORE_UPDATES], 'readwrite', (tx) => {
      tx.objectStore(STORE_UPDATES).add({ docId: this.docId, update } satisfies UpdateRecord);
      const docs = tx.objectStore(STORE_DOCS);
      const get = docs.get(this.docId);
      get.onsuccess = () => {
        const prev = get.result as DocRow | undefined;
        docs.put({
          id: this.docId,
          createdAt: prev?.createdAt ?? now,
          updatedAt: now,
          title,
        } satisfies DocRow);
      };
    });
  }

  /** Sustituye todos los registros por una instantánea. Atómico: si falla, no se pierde nada. */
  private async compact(): Promise<void> {
    try {
      const full = Y.encodeStateAsUpdate(this.ydoc);
      await runTx(this.getDb(), [STORE_UPDATES], 'readwrite', (tx) => {
        const store = tx.objectStore(STORE_UPDATES);
        const cur = store.index('byDoc').openCursor(this.docId);
        cur.onsuccess = () => {
          const c = cur.result;
          if (c) {
            c.delete();
            c.continue();
          } else {
            store.add({ docId: this.docId, update: full } satisfies UpdateRecord);
          }
        };
      });
      this.storedCount = 1;
    } catch (e) {
      // No es pérdida de datos (la transacción es atómica); se reintentará más tarde.
      console.warn('Relay: la compactación falló', describeError(e));
    }
  }
}
