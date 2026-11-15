import { useEffect, useState } from 'react';
import { api, type VersionEntry } from '../api';
import { Icon } from './Icons';
import { Loader } from './Logo';

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function HistoryPanel(props: {
  documentId: string;
  selectedId: string | null;
  onSelect: (version: (VersionEntry & { content: string }) | null) => void;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .versions(props.documentId)
      .then(({ versions }) => setVersions(versions))
      .catch((err) => setError((err as Error).message));
  }, [props.documentId]);

  const open = async (entry: VersionEntry, isCurrent: boolean) => {
    if (isCurrent) {
      props.onSelect(null);
      return;
    }
    setLoadingId(entry.id);
    setError('');
    try {
      props.onSelect((await api.version(props.documentId, entry.id)).version);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingId(null);
    }
  };

  // Group entries by day for a scannable timeline.
  const groups: { day: string; items: VersionEntry[] }[] = [];
  for (const v of versions ?? []) {
    const day = dayLabel(v.updatedAt);
    if (groups.at(-1)?.day !== day) groups.push({ day, items: [] });
    groups.at(-1)!.items.push(v);
  }

  return (
    <aside className="side-panel" aria-label="Version history">
      <div className="side-panel-head">
        <h2>Version history</h2>
        <button className="icon-btn" aria-label="Close history" onClick={props.onClose}>
          <Icon name="close" />
        </button>
      </div>
      <p className="side-panel-note">Select a version to preview it. Edits made within a few minutes of each other are grouped.</p>
      {error && <p className="error">{error}</p>}
      <div className="side-panel-scroll">
        {!versions ? (
          <Loader label="Loading history" size={40} inline />
        ) : (
          groups.map((group) => (
            <section key={group.day} className="history-group">
              <h3>{group.day}</h3>
              <ul className="history-list">
                {group.items.map((v) => {
                  const isCurrent = v.id === versions[0].id;
                  const selected = props.selectedId === v.id || (isCurrent && props.selectedId === null);
                  return (
                    <li key={v.id}>
                      <button className={`history-item${selected ? ' selected' : ''}`} onClick={() => void open(v, isCurrent)}>
                        <span className="history-time">
                          {new Date(v.updatedAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          {isCurrent && <span className="badge badge-current">Current</span>}
                        </span>
                        {v.label && <span className="history-label">{v.label}</span>}
                        <span className="history-author">
                          <span className="avatar avatar-xs">{v.author?.name[0] ?? '?'}</span>
                          {v.author?.name ?? 'Unknown'}
                        </span>
                        {loadingId === v.id && <span className="hint">Loading…</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
