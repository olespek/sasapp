import { useState } from 'react';
import { api } from '../api';
import { Logo } from './Logo';

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Innlogging feilet');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-screen login-bg">
      <form className="card login" onSubmit={submit}>
        <div className="login-logo">
          <Logo />
        </div>
        <h1>Arenaplan</h1>
        <label>
          Brukernavn
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label>
          Passord
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <div className="error">{error}</div>}
        <button className="btn primary" disabled={busy || !username || !password}>
          {busy ? 'Logger inn …' : 'Logg inn'}
        </button>
      </form>
    </div>
  );
}
