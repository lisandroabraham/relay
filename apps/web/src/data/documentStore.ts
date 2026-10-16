import * as Y from 'yjs';
import {
  STORE_DOCS,
  STORE_UPDATES,
  StorageError,
  openRelayDb,
  runTx,
  type DocRow,
} from './idb';
import { DocPersistence, readTitle, type PersistenceOptions, type SaveState } from './persistence';

export const MAX_TITLE_LENGTH = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isValidDocId = (id: string): boolean => UUID_RE.test(id);

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/** Un documento abierto. Sin dependencias de React. */
export interface OpenDocument {
  readonly id: string;
  readonly ydoc: Y.Doc;
  readonly text: Y.Text;
  readonly meta: Y.Map<unknown>;
  readonly persistence: DocPersistence;
  getTitle(): string;
  /** El título es un registro "último escritor gana", no un texto colaborativo. */
  setTitle(title: string): void;
  close(): Promise<SaveState>;
}

export class DocumentStore {
  private constructor(
    private db: IDBDatabase,
    private readonly factory: IDBFactory | undefined,
    private readonly opts: PersistenceOptions,
  ) {}

  static async open(
    factory: IDBFactory | undefined = globalThis.indexedDB,
    opts: PersistenceOptions = {},
  ): Promise<DocumentStore> {
    return new DocumentStore(await openRelayDb(factory), factory, opts);
  }

  close(): void {
    this.db.close();
  }

  /** Reabre la conexión (p. ej. si el navegador la cerró). */
  async reopen(): Promise<void> {
    this.db = await openRelayDb(this.factory);
  }

  async list(): Promise<DocRow[]> {
    const rows = await runTx<DocRow[]>(this.db, [STORE_DOCS], 'readonly', (tx, set) => {
      const req = tx.objectStore(STORE_DOCS).getAll();
      req.onsuccess = () => set(req.result as DocRow[]);
    });
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async create(): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await runTx(this.db, [STORE_DOCS], 'readwrite', (tx) => {
      tx.objectStore(STORE_DOCS).add({
        id,
        createdAt: now,
        updatedAt: now,
        title: '',
      } satisfies DocRow);
    });
    return id;
  }

  async openDocument(id: string): Promise<OpenDocument> {
    if (!isValidDocId(id)) throw new NotFoundError('Identificador de documento no válido.');
    const row = await runTx<DocRow | undefined>(this.db, [STORE_DOCS], 'readonly', (tx, set) => {
      const req = tx.objectStore(STORE_DOCS).get(id);
      req.onsuccess = () => set(req.result as DocRow | undefined);
    });
    if (!row) throw new NotFoundError('Este documento no existe en este navegador.');

    const ydoc = new Y.Doc({ guid: id });
    const persistence = new DocPersistence(() => this.db, id, ydoc, this.opts);
    try {
      await persistence.load();
    } catch (e) {
      ydoc.destroy();
      throw e;
    }
    const meta = ydoc.getMap<unknown>('meta');
    return {
      id,
      ydoc,
      text: ydoc.getText('content'),
      meta,
      persistence,
      getTitle: () => readTitle(ydoc),
      setTitle: (title) => meta.set('title', title.slice(0, MAX_TITLE_LENGTH)),
      close: async () => {
        const s = await persistence.close();
        ydoc.destroy();
        return s;
      },
    };
  }

  /** Diagnóstico/tests: cuántos registros de actualización hay guardados. */
  countStoredUpdates(id: string): Promise<number> {
    return runTx<number>(this.db, [STORE_UPDATES], 'readonly', (tx, set) => {
      const req = tx.objectStore(STORE_UPDATES).index('byDoc').count(id);
      req.onsuccess = () => set(req.result);
    });
  }
}

export { StorageError };
