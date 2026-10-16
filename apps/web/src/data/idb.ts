// Acceso mínimo a IndexedDB. Cada escritura se confirma cuando la transacción
// termina (tx.oncomplete); si falla o aborta, la promesa se rechaza.

export const DB_NAME = 'relay';
export const DB_VERSION = 1;
export const STORE_DOCS = 'docs';
export const STORE_UPDATES = 'updates';

/** Fila de la lista de documentos. `title` es una caché de lectura:
 *  la fuente de verdad es el Y.Doc (mapa "meta"). */
export interface DocRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
}

export interface UpdateRecord {
  docId: string;
  update: Uint8Array;
}

export class StorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageError';
  }
}

export function describeError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === 'QuotaExceededError') return 'El almacenamiento del navegador está lleno.';
    if (e.name === 'InvalidStateError') return 'La base de datos local está cerrada.';
    if (e.name === 'SecurityError') return 'El navegador bloquea el almacenamiento local.';
    return `${e.name}: ${e.message}`;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

export function openRelayDb(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<IDBDatabase> {
  if (!factory) {
    return Promise.reject(
      new StorageError('IndexedDB no está disponible en este navegador o contexto.'),
    );
  }
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = factory.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(new StorageError(describeError(e), { cause: e }));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore(STORE_DOCS, { keyPath: 'id' });
      const updates = db.createObjectStore(STORE_UPDATES, { autoIncrement: true });
      updates.createIndex('byDoc', 'docId');
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(new StorageError(describeError(req.error), { cause: req.error }));
    req.onblocked = () =>
      reject(new StorageError('La base de datos está bloqueada por otra pestaña de Relay.'));
  });
}

/** Ejecuta `work` dentro de una transacción y resuelve solo cuando ésta se completa. */
export function runTx<T = void>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, setResult: (v: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let result: T | undefined;
    let tx: IDBTransaction;
    try {
      tx = db.transaction(stores, mode);
    } catch (e) {
      reject(new StorageError(describeError(e), { cause: e }));
      return;
    }
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(new StorageError(describeError(tx.error), { cause: tx.error }));
    tx.onabort = () =>
      reject(new StorageError(describeError(tx.error ?? new Error('Transacción abortada.'))));
    try {
      work(tx, (v) => {
        result = v;
      });
    } catch (e) {
      try {
        tx.abort();
      } catch {
        /* ya cerrada */
      }
      reject(new StorageError(describeError(e), { cause: e }));
    }
  });
}
