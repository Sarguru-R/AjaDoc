import { useEffect, useState, type FormEvent } from 'react';
import { api, type ShareRole, type SharingInfo, type User } from '../api';
import { Loader } from './Logo';

export function ShareDialog({ documentId, onClose }: { documentId: string; onClose: () => void }) {
  const [info, setInfo] = useState<SharingInfo | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ShareRole>('editor');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api.getShares(documentId), api.users()])
      .then(([shares, { users }]) => {
        setInfo(shares);
        setUsers(users);
      })
      .catch((err) => setError(err.message));
  }, [documentId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (action: () => Promise<SharingInfo>) => {
    setBusy(true);
    setError('');
    try {
      setInfo(await action());
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await run(() => api.share(documentId, email, role))) setEmail('');
  };

  // Suggest users who do not already have access.
  const taken = new Set([info?.owner.id, ...(info?.shares.map((s) => s.user.id) ?? [])]);
  // A few people who don't have access yet, matching what has been typed.
  const needle = email.trim().toLowerCase();
  const suggestions = users
    .filter((u) => !taken.has(u.id))
    .filter((u) => !needle || u.email.includes(needle) || u.name.toLowerCase().includes(needle))
    .slice(0, 4);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="modal-head">
          <h2 id="share-title">Share document</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={submit} className="share-form">
          <input
            type="email"
            placeholder="Add people by email"
            value={email}
            list="share-suggestions"
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
          <datalist id="share-suggestions">
            {suggestions.map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
          </datalist>
          <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Access level">
            <option value="editor">Can edit</option>
            <option value="commenter">Can comment</option>
            <option value="viewer">Can view</option>
          </select>
          <button className="btn btn-primary" disabled={busy}>Share</button>
        </form>
        {suggestions.length > 0 && (
          <p className="muted small">
            Try: {suggestions.map((u, i) => (
              <span key={u.id}>
                {i > 0 && ', '}
                <button type="button" className="link" onClick={() => setEmail(u.email)}>{u.email}</button>
              </span>
            ))}
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}

        <h3>People with access</h3>
        {!info ? (
          <Loader label="Loading people" size={40} inline />
        ) : (
          <ul className="people">
            <li>
              <Person user={info.owner} />
              <span className="muted">Owner</span>
            </li>
            {info.shares.map((share) => (
              <li key={share.user.id}>
                <Person user={share.user} />
                <span className="people-actions">
                  <select
                    value={share.role}
                    disabled={busy}
                    aria-label={`Access for ${share.user.name}`}
                    onChange={(e) => run(() => api.share(documentId, share.user.email, e.target.value as ShareRole))}
                  >
                    <option value="editor">Can edit</option>
                    <option value="commenter">Can comment</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(() => api.unshare(documentId, share.user.id))}>
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Person({ user }: { user: User }) {
  return (
    <span className="person">
      <span className="avatar">{user.name[0]}</span>
      <span>
        <span className="person-name">{user.name}</span>
        <span className="muted small">{user.email}</span>
      </span>
    </span>
  );
}
