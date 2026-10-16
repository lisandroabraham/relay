import { describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import * as Y from 'yjs';
import { DocumentStore, NotFoundError } from '../src/data/documentStore';
import type { SaveState } from '../src/data/persistence';

const newFactory = () => new IDBFactory();

/** Simula "recargar la página": cierra la conexión y abre otra sobre el mismo almacenamiento. */
async function reload(store: DocumentStore, factory: IDBFactory): Promise<DocumentStore> {
  store.close();
  return DocumentStore.open(factory);
}

describe('persistencia local', () => {
  it('restaura el contenido y el título tras una recarga', async () => {
    const factory = newFactory();
    let store = await DocumentStore.open(factory);
    const id = await store.create();
    const doc = await store.openDocument(id);
    doc.text.insert(0, 'hola mundo');
    doc.setTitle('Mi nota');
    expect((await doc.close()).kind).toBe('saved');

    store = await reload(store, factory);
    const again = await store.openDocument(id);
    expect(again.text.toString()).toBe('hola mundo');
    expect(again.getTitle()).toBe('Mi nota');
    await again.close();
  });

  it('lista varios documentos con su título, el más reciente primero', async () => {
    const factory = newFactory();
    const store = await DocumentStore.open(factory);
    const a = await store.openDocument(await store.create());
    a.setTitle('A');
    await a.close();
    await new Promise((r) => setTimeout(r, 5));
    const b = await store.openDocument(await store.create());
    b.setTitle('B');
    await b.close();

    const rows = await store.list();
    expect(rows.map((r) => r.title)).toEqual(['B', 'A']);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2);
  });

  it('no mezcla el contenido de documentos distintos', async () => {
    const factory = newFactory();
    const store = await DocumentStore.open(factory);
    const ida = await store.create();
    const idb = await store.create();
    const a = await store.openDocument(ida);
    const b = await store.openDocument(idb);
    a.text.insert(0, 'solo A');
    b.text.insert(0, 'solo B');
    await a.close();
    await b.close();
    const a2 = await store.openDocument(ida);
    const b2 = await store.openDocument(idb);
    expect(a2.text.toString()).toBe('solo A');
    expect(b2.text.toString()).toBe('solo B');
  });

  it('reabrir muchas veces no duplica el contenido', async () => {
    const factory = newFactory();
    const store = await DocumentStore.open(factory);
    const id = await store.create();
    const first = await store.openDocument(id);
    first.text.insert(0, 'abc');
    await first.close();
    for (let i = 0; i < 3; i++) {
      const d = await store.openDocument(id);
      expect(d.text.toString()).toBe('abc');
      await d.close(); // sin cambios: no debe escribir nada nuevo
    }
    expect(await store.countStoredUpdates(id)).toBe(1);
  });

  it('compacta sin perder contenido', async () => {
    const factory = newFactory();
    const store = await DocumentStore.open(factory, { compactThreshold: 10 });
    const id = await store.create();
    const doc = await store.openDocument(id);
    let expected = '';
    for (let i = 0; i < 60; i++) {
      doc.text.insert(doc.text.length, String(i % 10));
      expected += String(i % 10);
      await doc.persistence.flush(); // fuerza un registro por cambio
    }
    expect(await store.countStoredUpdates(id)).toBeLessThan(15);
    await doc.close();

    const again = await DocumentStore.open(factory);
    const reopened = await again.openDocument(id);
    expect(reopened.text.toString()).toBe(expected);
  });

  it('rechaza ids inválidos y documentos inexistentes', async () => {
    const store = await DocumentStore.open(newFactory());
    await expect(store.openDocument('../../etc')).rejects.toBeInstanceOf(NotFoundError);
    await expect(store.openDocument(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('IndexedDB ausente produce un error claro', async () => {
    await expect(DocumentStore.open(undefined)).rejects.toThrow(/IndexedDB no está disponible/);
  });
});

describe('errores de almacenamiento', () => {
  it('nunca declara "guardado" si la escritura falló, y se recupera sin huecos al reintentar', async () => {
    const factory = newFactory();
    const store = await DocumentStore.open(factory);
    const id = await store.create();
    const doc = await store.openDocument(id);

    doc.text.insert(0, 'antes ');
    expect((await doc.persistence.flush()).kind).toBe('saved');

    const seen: SaveState['kind'][] = [];
    doc.persistence.subscribe((s) => seen.push(s.kind));

    store.close(); // la conexión desaparece: toda escritura falla
    doc.text.insert(doc.text.length, 'durante-1 ');
    expect((await doc.persistence.flush()).kind).toBe('error');
    doc.text.insert(doc.text.length, 'durante-2');
    expect((await doc.persistence.flush()).kind).toBe('error');
    // seen[0] es el estado inicial emitido al suscribirse; tras el fallo no debe aparecer 'saved'.
    expect(seen.slice(1)).not.toContain('saved');
    expect(seen.slice(1)).toContain('error');

    await store.reopen();
    expect((await doc.persistence.retry()).kind).toBe('saved');

    // Una "recarga" nueva debe ver TODO, incluido lo escrito durante el fallo.
    const fresh = await DocumentStore.open(factory);
    const reopened = await fresh.openDocument(id);
    expect(reopened.text.toString()).toBe('antes durante-1 durante-2');
  });
});

describe('propiedades de Yjs que usamos', () => {
  it('aplicar la misma actualización dos veces es idempotente', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getText('content').insert(0, 'xyz');
    const update = Y.encodeStateAsUpdate(a);
    Y.applyUpdate(b, update);
    Y.applyUpdate(b, update);
    expect(b.getText('content').toString()).toBe('xyz');
  });
});
