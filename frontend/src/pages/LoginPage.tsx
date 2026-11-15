import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type User } from '../api';
import { AuthLayout } from '../components/AuthLayout';

export function LoginPage({ onLogin, notice }: { onLogin: (user: User) => void; notice?: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin((await api.login(email, password)).user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Sign in" title="Welcome back">
      {notice && !error && <p className="notice" role="status">{notice}</p>}

      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'} <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="auth-switch">
        New to AjaDoc? <Link to="/signup">Create an account</Link>
      </p>
    </AuthLayout>
  );
}
