import type { SaveState } from '../data/persistence';

interface Props {
  state: SaveState;
  onRetry: () => void;
}

export function SaveBadge({ state, onRetry }: Props) {
  switch (state.kind) {
    case 'loading':
      return <p role="status" className="badge">… Cargando</p>;
    case 'saving':
      return <p role="status" className="badge">… Guardando en este dispositivo</p>;
    case 'saved':
      return <p role="status" className="badge badge-ok">✓ Guardado en este dispositivo</p>;
    case 'error':
      return (
        <p role="alert" className="badge badge-error">
          ⚠ No se pudo guardar: {state.message}{' '}
          <button type="button" onClick={onRetry}>
            Reintentar
          </button>
        </p>
      );
  }
}
