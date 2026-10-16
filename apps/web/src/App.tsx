import { useEffect, useState } from 'react';
import { DocumentStore } from './data/documentStore';
import { describeError } from './data/idb';
import { DocList } from './ui/DocList';
import { Editor } from './ui/Editor';

type Route = { kind: 'list' } | { kind: 'doc'; id: string };

function parseHash(hash: string): Route {
  const m = /^#\/doc\/([^/?#]+)$/.exec(hash);
  return m && m[1] ? { kind: 'doc', id: decodeURIComponent(m[1]) } : { kind: 'list' };
}

export function App() {
  const [store, setStore] = useState<DocumentStore | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let opened: DocumentStore | null = null;
    DocumentStore.open()
      .then((s) => {
        if (cancelled) s.close();
        else {
          opened = s;
          setStore(s);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setFatal(describeError(e));
      });
    return () => {
      cancelled = true;
      opened?.close();
    };
  }, []);

  if (fatal) {
    return (
      <main className="page">
        <h1>Relay</h1>
        <p role="alert" className="banner banner-error">
          ⚠ No se puede usar el almacenamiento local: {fatal}
        </p>
        <p>
          Sin almacenamiento local Relay no puede guardar nada. Si estás en una ventana privada o
          con el almacenamiento bloqueado, prueba en una ventana normal.
        </p>
      </main>
    );
  }
  if (!store) {
    return (
      <main className="page">
        <p role="status">Abriendo almacenamiento local…</p>
      </main>
    );
  }
  return route.kind === 'doc' ? (
    <Editor store={store} id={route.id} />
  ) : (
    <DocList store={store} />
  );
}
