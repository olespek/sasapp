import { useState } from 'react';
import { api } from '../api';

export function PasswordDialog({ onClose, toast }: { onClose: () => void; toast: (t: string, e?: boolean) => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== repeat) return setError('Passordene er ikke like');
    try {
      await api.changePassword(current, next);
      toast('Passordet er endret');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke endre passord');
    }
  };

  return (
    <div className="modal-bg" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h3>Bytt passord</h3>
        <label>
          Nåværende passord
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </label>
        <label>
          Nytt passord (minst 8 tegn)
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </label>
        <label>
          Gjenta nytt passord
          <input type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <div className="row end">
          <button type="button" className="btn" onClick={onClose}>
            Avbryt
          </button>
          <button className="btn primary">Lagre</button>
        </div>
      </form>
    </div>
  );
}
