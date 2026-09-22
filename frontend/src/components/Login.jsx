import { useState } from 'react';
import { apiFetch, setCsrfToken } from '../api/socket';
import './Login.css';

export default function Login({ onAuthenticated }) {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const response = await apiFetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to sign in');
      setCsrfToken(data.csrfToken); onAuthenticated(data.user);
    } catch (requestError) { setError(requestError.message); } finally { setBusy(false); }
  }
  return <main className="login"><section className="login__panel"><p>RESQ-X / SECURE ACCESS</p><h1>Command center login</h1><form onSubmit={submit}><label>Username<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{error && <output role="alert">{error}</output>}<button disabled={busy}>{busy ? 'SIGNING IN…' : 'SIGN IN'}</button></form><small>Authorized rescue personnel only. Sessions expire automatically.</small></section></main>;
}
