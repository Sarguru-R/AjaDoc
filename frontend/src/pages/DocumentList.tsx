import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, IMPORT_ACCEPT, IMPORT_HINT, ROLE_LABEL, type DocumentSummary } from '../api';
import { Icon } from '../components/Icons';
import { Loader } from '../components/Logo';
import { Thumbnail } from '../components/Thumbnail';
import { TEMPLATES, type Template } from '../templates';

type Filter = 'all' | 'owned' | 'shared';
type View = 'grid' | 'list';

const FEATURED = ['resume', 'meeting-notes', 'project-proposal', 'prd', 'tech-design', 'status-report'];

function readView(): View {
  try {
    return localStorage.getItem('ajadoc-doc-view') === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function relativeTime(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function DocumentList() {
  const [docs, setDocs] = useState<{ owned: DocumentSummary[]; shared: DocumentSummary[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setViewState] = useState<View>(readView);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const setView = (next: View) => {
    setViewState(next);
    try {
      localStorage.setItem('ajadoc-doc-view', next);
    } catch {
      /* ignore */
    }
  };
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const load = async () => {
    setError('');
    try {
      setDocs(await api.listDocuments());
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (template?: Template) => {
    setBusy(true);
    setError('');
    try {
      const { document } = template
        ? await api.createDocument(template.title, template.content, template.name)
        : await api.createDocument();
      navigate(`/d/${document.id}`, { state: { focusTitle: true } });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const { document } = await api.importDocument(file);
      navigate(`/d/${document.id}`);
    } catch (err) {
      setError(`Could not import "${file.name}": ${(err as Error).message}`);
      setBusy(false);
    }
  };

  const remove = async (doc: DocumentSummary) => {
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteDocument(doc.id);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const rows = useMemo(() => {
    if (!docs) return [];
    const all = filter === 'owned' ? docs.owned : filter === 'shared' ? docs.shared : [...docs.owned, ...docs.shared];
    const needle = query.trim().toLowerCase();
    return all
      .filter((d) => !needle || d.title.toLowerCase().includes(needle) || d.owner.name.toLowerCase().includes(needle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [docs, filter, query]);

  const counts = { all: (docs?.owned.length ?? 0) + (docs?.shared.length ?? 0), owned: docs?.owned.length ?? 0, shared: docs?.shared.length ?? 0 };

  return (
    <div className="page-frame">
      {/* Frozen header: title, actions, search and filters. Only the table below scrolls. */}
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>Documents</h1>
          </div>
          <div className="actions">
            <button className="btn btn-outline-light" disabled={busy} onClick={() => fileInput.current?.click()} title={IMPORT_HINT}>
              <Icon name="upload" /> Import file
            </button>
            <button className="btn btn-accent" disabled={busy} onClick={() => void create()}>
              <Icon name="plus" /> New document
            </button>
            <input ref={fileInput} type="file" accept={IMPORT_ACCEPT} hidden onChange={importFile} />
          </div>
        </div>
        <div className="page-header-row page-tools">
          <div className="tabs" role="tablist" aria-label="Filter documents">
            {(['all', 'owned', 'shared'] as Filter[]).map((f) => (
              <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {f === 'all' ? 'All' : f === 'owned' ? 'Owned by me' : 'Shared with me'}
                <span className="tab-count">{counts[f]}</span>
              </button>
            ))}
          </div>
          <label className="search">
            <Icon name="search" />
            <input type="search" placeholder="Search by title or owner" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search documents" />
          </label>
        </div>
      </header>

      <main className="page-scroll">
        <section className="gallery">
          <div className="gallery-inner">
            <div className="section-head">
              <h2>Start a new document</h2>
              <button className="link-btn gallery-toggle" onClick={() => setGalleryOpen((v) => !v)} aria-expanded={galleryOpen}>
                Template gallery <Icon name="caret" size={13} className={galleryOpen ? 'flip' : ''} />
              </button>
            </div>
            {galleryOpen ? (
              (['Work', 'Engineering', 'Personal', 'Education'] as const).map((category) => (
                <div key={category} className="gallery-group">
                  <h3>{category}</h3>
                  <div className="template-row">
                    {TEMPLATES.filter((t) => t.category === category).map((t) => (
                      <TemplateCard key={t.id} template={t} disabled={busy} onPick={() => void create(t)} />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              <div className="template-row">
                <button className="template-card blank" disabled={busy} onClick={() => void create()}>
                  <div className="thumb blank-thumb">
                    <Icon name="plus" size={40} />
                  </div>
                  <span className="template-name">Blank document</span>
                  <span className="template-desc">Start from scratch</span>
                </button>
                {FEATURED.map((id) => TEMPLATES.find((t) => t.id === id)!).map((t) => (
                  <TemplateCard key={t.id} template={t} disabled={busy} onPick={() => void create(t)} />
                ))}
              </div>
            )}
          </div>
        </section>

        <div className="page-content">
          <div className="section-head">
            <h2>{filter === 'shared' ? 'Shared with me' : filter === 'owned' ? 'Owned by me' : 'Recent documents'}</h2>
            <div className="view-toggle" role="group" aria-label="View">
              <button className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} title="Grid view" onClick={() => setView('grid')}>
                <Icon name="grid" />
              </button>
              <button className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} title="List view" onClick={() => setView('list')}>
                <Icon name="outline" />
              </button>
            </div>
          </div>
          {error && (
            <div className="error error-row" role="alert">
              <span>{error}</span>
              <button className="btn btn-sm" onClick={() => void load()}>
                <Icon name="refresh" size={14} /> Retry
              </button>
            </div>
          )}

          {!docs ? (
            !error && <Loader label="Loading documents" inline />
          ) : rows.length === 0 ? (
            <div className="empty-state">
              <Icon name="doc" size={28} />
              <p className="empty-title">{query ? 'No documents match your search' : filter === 'shared' ? 'Nothing shared with you yet' : 'No documents yet'}</p>
              <p className="muted small">{query ? 'Try a different title or owner name.' : `Create a document or import a file. ${IMPORT_HINT}.`}</p>
            </div>
          ) : view === 'grid' ? (
            <div className="doc-grid">
              {rows.map((doc) => (
                <div key={doc.id} className="doc-card" role="link" tabIndex={0} onClick={() => navigate(`/d/${doc.id}`)} onKeyDown={(e) => e.key === 'Enter' && navigate(`/d/${doc.id}`)}>
                  <Thumbnail html={doc.preview ?? ''} />
                  <div className="doc-card-body">
                    <span className="doc-card-title" title={doc.title}>{doc.title}</span>
                    <span className="doc-card-meta">
                      {doc.role === 'owner' ? (
                        doc.shareCount ? <span className="badge badge-shared">Shared · {doc.shareCount}</span> : <span className="badge">Private</span>
                      ) : (
                        <span className={`badge badge-${doc.role}`}>{ROLE_LABEL[doc.role]}</span>
                      )}
                      <span className="muted">{relativeTime(doc.updatedAt)}</span>
                      {doc.role === 'owner' && (
                        <button
                          className="icon-btn doc-card-delete"
                          title="Delete document"
                          aria-label={`Delete ${doc.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(doc);
                          }}
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                    </span>
                    {doc.role !== 'owner' && <span className="doc-card-owner">Owner: {doc.owner.name}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="hide-sm">Owner</th>
                  <th>Access</th>
                  <th className="hide-sm">Last edited</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((doc) => (
                  <tr key={doc.id} onClick={() => navigate(`/d/${doc.id}`)}>
                    <td>
                      <Link to={`/d/${doc.id}`} className="doc-link" onClick={(e) => e.stopPropagation()}>
                        <span className="doc-icon"><Icon name="doc" size={15} /></span>
                        <span className="doc-title">{doc.title}</span>
                      </Link>
                    </td>
                    <td className="hide-sm">{doc.role === 'owner' ? 'Me' : doc.owner.name}</td>
                    <td>
                      {doc.role === 'owner' ? (
                        doc.shareCount ? <span className="badge badge-shared">Shared · {doc.shareCount}</span> : <span className="badge">Private</span>
                      ) : (
                        <span className={`badge badge-${doc.role}`}>{ROLE_LABEL[doc.role]}</span>
                      )}
                    </td>
                    <td className="hide-sm muted">
                      {relativeTime(doc.updatedAt)}
                      {doc.updatedBy && <span className="by"> · {doc.updatedBy.name.split(' ')[0]}</span>}
                    </td>
                    <td className="row-actions">
                      {doc.role === 'owner' && (
                        <button
                          className="icon-btn"
                          title="Delete document"
                          aria-label={`Delete ${doc.title}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void remove(doc);
                          }}
                        >
                          <Icon name="trash" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function TemplateCard({ template, disabled, onPick }: { template: Template; disabled: boolean; onPick: () => void }) {
  return (
    <button className="template-card" disabled={disabled} onClick={onPick} title={template.description}>
      <Thumbnail html={template.content} accent={template.accent} />
      <span className="template-name">{template.name}</span>
      <span className="template-desc">{template.description}</span>
    </button>
  );
}
