import { useCallback, useEffect, useState } from 'react';
import type { DocumentStore } from '../data/documentStore';
import { describeError, type DocRow } from '../data/idb';

export function DocList({ store }: { store: DocumentStore }) {
  const [rows, setRows] = useState<DocRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    store
      .list()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e: unknown) => setError(describeError(e)));
  }, [store]);

  useEffect(refresh, [refresh]);

  const create = async () => {
    try {
      const id = await store.create();
      location.hash = `#/doc/${id}`;
    } catch (e) {
      setError(describeError(e));
    }
  };

  return (
    <main className="page">
      <h1>Relay</h1>
      <p className="banner">
        Tus documentos se guardan solo en este navegador. Si borras los datos del sitio o cambias
        de dispositivo, se pierden. La sincronización todavía no existe.
      </p>
      <button type="button" className="primary" onClick={create}>
        Nuevo documento
      </button>
      {error && (
        <p role="alert" className="banner banner-error">
          ⚠ {error}
        </p>
      )}
      <h2>Documentos</h2>
      {rows === null ? (
        <p role="status">Cargando…</p>
      ) : rows.length === 0 ? (
        <p>Todavía no hay documentos.</p>
      ) : (
        <ul className="doc-list" aria-label="Documentos">
          {rows.map((r) => (
            <li key={r.id}>
              <a href={`#/doc/${r.id}`}>{r.title || 'Sin título'}</a>
              <span className="muted"> · {new Date(r.updatedAt).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
