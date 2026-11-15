import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, canComment, canEdit, type Comment, type Role, type User } from '../api';
import { Icon } from './Icons';
import { Loader } from './Logo';

const REFRESH_MS = 10000;

function when(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function CommentsPanel(props: {
  documentId: string;
  role: Role;
  me: User;
  quote: string | null;
  onClearQuote: () => void;
  onReveal: (quote: string) => void;
  onCount: (open: number) => void;
  onClose: () => void;
}) {
  const { documentId, role, me, quote, onCount } = props;
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showResolved, setShowResolved] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);

  const apply = useCallback(
    (list: Comment[]) => {
      setComments(list);
      onCount(list.filter((c) => !c.resolved).length);
    },
    [onCount],
  );

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api
        .comments(documentId)
        .then(({ comments }) => !cancelled && apply(comments))
        .catch((err) => !cancelled && setError((err as Error).message));
    void load();
    const interval = window.setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [documentId, apply]);

  useEffect(() => {
    if (quote !== null || canComment(role)) input.current?.focus();
  }, [quote, role]);

  const run = async (action: () => Promise<{ comments: Comment[] }>) => {
    setBusy(true);
    setError('');
    try {
      apply((await action()).comments);
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
    if (!draft.trim()) return;
    if (await run(() => api.addComment(documentId, draft, quote))) {
      setDraft('');
      props.onClearQuote();
    }
  };

  const open = comments?.filter((c) => !c.resolved) ?? [];
  const resolved = comments?.filter((c) => c.resolved) ?? [];
  const mayResolve = (c: Comment) => canEdit(role) || (role === 'commenter' && c.author?.id === me.id);
  const mayDelete = (c: Comment) => role === 'owner' || (canComment(role) && c.author?.id === me.id);

  const renderComment = (c: Comment) => (
    <li key={c.id} className={`comment${c.resolved ? ' resolved' : ''}`}>
      <div className="comment-head">
        <span className="avatar avatar-sm">{c.author?.name[0] ?? '?'}</span>
        <span className="comment-author">{c.author?.id === me.id ? 'You' : c.author?.name ?? 'Unknown'}</span>
        <span className="comment-time">{when(c.createdAt)}</span>
        <span className="comment-actions">
          {mayResolve(c) && (
            <button className="icon-btn" title={c.resolved ? 'Reopen' : 'Resolve'} disabled={busy} onClick={() => run(() => api.resolveComment(documentId, c.id, !c.resolved))}>
              <Icon name={c.resolved ? 'reopen' : 'check'} size={15} />
            </button>
          )}
          {mayDelete(c) && (
            <button
              className="icon-btn"
              title="Delete"
              disabled={busy}
              onClick={() => confirm('Delete this comment?') && run(() => api.deleteComment(documentId, c.id))}
            >
              <Icon name="trash" size={15} />
            </button>
          )}
        </span>
      </div>
      {c.quote && (
        <button className="comment-quote" title="Show in document" onClick={() => props.onReveal(c.quote!)}>
          {c.quote}
        </button>
      )}
      <p className="comment-body">{c.body}</p>
      {c.resolved && c.resolvedBy && <p className="comment-resolved">Resolved by {c.resolvedBy.id === me.id ? 'you' : c.resolvedBy.name}</p>}
    </li>
  );

  return (
    <aside className="side-panel" aria-label="Comments">
      <div className="side-panel-head">
        <h2>
          Comments <span className="count">{open.length}</span>
        </h2>
        <button className="icon-btn" aria-label="Close comments" onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </div>

      {canComment(role) ? (
        <form className="comment-form" onSubmit={submit}>
          {quote ? (
            <div className="comment-draft-quote">
              <span>{quote}</span>
              <button type="button" className="icon-btn" aria-label="Remove quoted text" onClick={props.onClearQuote}>
                <Icon name="close" size={13} />
              </button>
            </div>
          ) : (
            <p className="hint">Tip: select text in the document first to comment on it.</p>
          )}
          <textarea
            ref={input}
            rows={3}
            placeholder="Add a comment…"
            value={draft}
            maxLength={5000}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit(e);
            }}
          />
          <div className="comment-form-actions">
            <span className="hint">Ctrl+Enter to post</span>
            <button className="btn btn-primary btn-sm" disabled={busy || !draft.trim()}>Comment</button>
          </div>
        </form>
      ) : (
        <p className="side-panel-note">You can read comments but not add them. Ask the owner for comment access.</p>
      )}
      {error && <p className="error">{error}</p>}

      <div className="side-panel-scroll">
        {!comments ? (
          <Loader label="Loading comments" size={40} inline />
        ) : open.length === 0 && resolved.length === 0 ? (
          <p className="side-panel-empty">No comments yet.</p>
        ) : (
          <>
            <ul className="comment-list">{open.map(renderComment)}</ul>
            {open.length === 0 && <p className="side-panel-empty">All comments are resolved.</p>}
            {resolved.length > 0 && (
              <>
                <button className="link-btn" onClick={() => setShowResolved((v) => !v)}>
                  {showResolved ? 'Hide' : 'Show'} resolved ({resolved.length})
                </button>
                {showResolved && <ul className="comment-list">{resolved.map(renderComment)}</ul>}
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
