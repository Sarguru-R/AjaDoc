import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, type User } from '../api';
import { AuthLayout } from '../components/AuthLayout';

const MIN_PASSWORD_LENGTH = 8;

/** Mirrors the server rules so most mistakes are caught before submitting; the server still validates. */
function validate(name: string, password: string, confirm: string): string {
  if (!name.trim()) return 'Name is required.';
  if (password.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (/^[a-zA-Z]+$/.test(password) || /^\d+$/.test(password)) return 'Password must contain both letters and numbers or symbols.';
  if (password !== confirm) return 'Passwords do not match.';
  return '';
}

export function SignupPage({ onSignup }: { onSignup: (user: User) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const problem = validate(name, password, confirm);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      onSignup((await api.signup(name.trim(), email, password)).user);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout eyebrow="Sign up" title="Create your account">
      <form onSubmit={submit} className="stack" noValidate>
        <label>
          Full name
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={100} required autoFocus />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={254} required />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={200}
            required
          />
          <span className="hint">At least {MIN_PASSWORD_LENGTH} characters, with letters and numbers or symbols.</span>
        </label>
        <label>
          Confirm password
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy}>
          {busy ? 'Creating account…' : 'Create account'} <span aria-hidden="true">→</span>
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link to="/">Sign in</Link>
      </p>
    </AuthLayout>
  );
}
