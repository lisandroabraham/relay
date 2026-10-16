import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, drawSelection, keymap } from '@codemirror/view';
import { defaultKeymap } from '@codemirror/commands';
import { yCollab, yUndoManagerKeymap } from 'y-codemirror.next';
import { MAX_TITLE_LENGTH, type DocumentStore, type OpenDocument } from '../data/documentStore';
import { describeError } from '../data/idb';
import type { SaveState } from '../data/persistence';
import { SaveBadge } from './SaveBadge';

export function Editor({ store, id }: { store: DocumentStore; id: string }) {
  const host = useRef<HTMLDivElement>(null);
  const docRef = useRef<OpenDocument | null>(null);
  const [doc, setDoc] = useState<OpenDocument | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: 'loading' });
  const [title, setTitle] = useState('');

  // Abrir / cerrar el documento (tolerante a StrictMode y a cambios rápidos de ruta).
  useEffect(() => {
    let cancelled = false;
    let opened: OpenDocument | null = null;
    store
      .openDocument(id)
      .then((d) => {
        if (cancelled) {
          void d.close();
          return;
        }
        opened = d;
        docRef.current = d;
        setDoc(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(describeError(e));
      });
    return () => {
      cancelled = true;
      docRef.current = null;
      setDoc(null);
      if (opened) void opened.close();
    };
  }, [store, id]);

  // Editor CodeMirror enlazado al Y.Text.
  useEffect(() => {
    if (!doc || !host.current) return;
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: doc.text.toString(),
        extensions: [
          drawSelection(),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Contenido del documento' }),
          keymap.of([...yUndoManagerKeymap, ...defaultKeymap]),
          yCollab(doc.text, null),
        ],
      }),
    });
    return () => view.destroy();
  }, [doc]);

  // Título (Y.Map "meta") y estado de guardado.
  useEffect(() => {
    if (!doc) return;
    const sync = () => setTitle(doc.getTitle());
    sync();
    doc.meta.observe(sync);
    const unsub = doc.persistence.subscribe(setSave);
    return () => {
      doc.meta.unobserve(sync);
      unsub();
    };
  }, [doc]);

  // Avisar si se intenta cerrar con cambios sin confirmar en disco.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const s = docRef.current?.persistence.getState();
      if (s && s.kind !== 'saved') e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  if (loadError) {
    return (
      <main className="page">
        <p role="alert" className="banner banner-error">
          ⚠ {loadError}
        </p>
        <a href="#/">← Volver a la lista</a>
      </main>
    );
  }

  return (
    <main className="page">
      <a href="#/">← Documentos</a>
      <label htmlFor="title" className="label">
        Título
      </label>
      <input
        id="title"
        className="title-input"
        value={title}
        maxLength={MAX_TITLE_LENGTH}
        disabled={!doc}
        placeholder="Sin título"
        onChange={(e) => doc?.setTitle(e.target.value)}
      />
      <SaveBadge state={save} onRetry={() => void doc?.persistence.retry()} />
      <p className="muted">
        Sin sincronización: este documento solo existe en este navegador (llega en el Día 2).
      </p>
      <div ref={host} className="editor" />
    </main>
  );
}
