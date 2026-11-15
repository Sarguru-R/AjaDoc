import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, ApiError, canComment, canEdit as roleCanEdit, DEFAULT_PAGE_SETUP, ROLE_LABEL, type DocumentFull, type PageSetup, type ExportFormat, type PresenceInfo, type VersionEntry } from '../api';
import { useUser } from '../App';
import { CommentsPanel } from '../components/CommentsPanel';
import { DownloadMenu } from '../components/DownloadMenu';
import { HistoryPanel } from '../components/HistoryPanel';
import { Icon, type IconName } from '../components/Icons';
import { Loader } from '../components/Logo';
import { ShareDialog } from '../components/ShareDialog';
import { AddBlock } from '../editor/AddBlock';
import { Dropdown } from '../editor/Dropdown';
import { BULLET_STYLES, buildExtensions, currentListStyle, NUMBER_STYLES, setListStyle } from '../editor/extensions';
import { OutlinePanel } from '../editor/OutlinePanel';
import { PAGE_GAP_PX, pageGeometry } from '../editor/page';
import { PageSetupDialog } from '../editor/PageSetupDialog';
import { REMEASURE } from '../editor/pagination';
import { Ruler } from '../editor/Ruler';

type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
type Panel = 'comments' | 'history' | null;

/** Per-browser layout preferences (outline open, page width). Storage can be unavailable; fall back. */
function usePreference<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T | null) ?? fallback;
    } catch {
      return fallback;
    }
  });
  const update = (next: T) => {
    setValue(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* ignore */
    }
  };
  return [value, update];
}

const AUTOSAVE_DELAY_MS = 800;
const PRESENCE_INTERVAL_MS = 5000;
const EDITING_WINDOW_MS = 20000; // "editing" if the user typed within this window

export function EditorPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<DocumentFull | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setDoc(null);
    setLoadError('');
    api
      .getDocument(id!)
      .then(({ document }) => setDoc(document))
      .catch((err: ApiError) => setLoadError(err.status === 404 ? 'This document does not exist or has not been shared with you.' : err.message));
  }, [id, attempt]);

  if (loadError) {
    return (
      <div className="page-scroll">
        <div className="page-content">
          <div className="error error-row" role="alert">
            <span>{loadError}</span>
            <button className="btn btn-sm" onClick={() => setAttempt((n) => n + 1)}>
              <Icon name="refresh" size={14} /> Retry
            </button>
          </div>
          <Link to="/">← Back to documents</Link>
        </div>
      </div>
    );
  }
  if (!doc) return <Loader label="Loading document" />;
  // Keyed so that switching documents resets all editor state.
  return <DocumentEditor key={doc.id} initial={doc} />;
}

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function DocumentEditor({ initial }: { initial: DocumentFull }) {
  const me = useUser();
  const editable = roleCanEdit(initial.role);
  const commentable = canComment(initial.role);
  const location = useLocation();
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<SaveStatus>('saved');
  const [errorMessage, setErrorMessage] = useState('');
  const [sharing, setSharing] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [commentQuote, setCommentQuote] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState(0);
  const [presence, setPresence] = useState<PresenceInfo | null>(null);
  const [lastEdit, setLastEdit] = useState({ at: initial.updatedAt, by: initial.updatedBy });
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState<(VersionEntry & { content: string }) | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [outline, setOutline] = usePreference<'open' | 'closed'>('ajadoc-outline', window.innerWidth >= 1280 ? 'open' : 'closed');
  const [pageSetup, setPageSetup] = useState<PageSetup>(initial.pageSetup ?? DEFAULT_PAGE_SETUP);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [pages, setPages] = useState(1);
  const [scrollWidth, setScrollWidth] = useState(() => window.innerWidth);
  const scrollArea = useRef<HTMLDivElement>(null);

  // Save pipeline state lives in refs: it changes on every keystroke and must not re-render.
  const version = useRef(initial.version);
  const pending = useRef<{ title?: string; content?: string; pageSetup?: PageSetup }>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const inFlight = useRef(false);
  const lastTyped = useRef(0);
  const committedTitle = useRef(initial.title); // last title sent to the server
  const geometry = pageGeometry(pageSetup);
  // Print layout needs room for a whole page; on narrow screens the page simply fills the width.
  const paged = scrollWidth >= geometry.width + 40;
  const metrics = useRef({ enabled: paged, pageHeight: geometry.height, marginTop: geometry.margins.top, marginBottom: geometry.margins.bottom, gap: PAGE_GAP_PX });
  metrics.current = { enabled: paged, pageHeight: geometry.height, marginTop: geometry.margins.top, marginBottom: geometry.margins.bottom, gap: PAGE_GAP_PX };

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((current) => (current === message ? '' : current)), 4000);
  }, []);

  /** Sends queued changes. Only one request is in flight at a time so versions stay in order. */
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || Object.keys(pending.current).length === 0) return;
    const changes = pending.current;
    pending.current = {};
    inFlight.current = true;
    setStatus('saving');
    try {
      const { document } = await api.updateDocument(initial.id, { ...changes, baseVersion: version.current });
      version.current = document.version;
      setLastEdit({ at: document.updatedAt, by: document.updatedBy });
      inFlight.current = false;
      if (Object.keys(pending.current).length > 0) {
        void flush(); // more edits arrived while saving
      } else {
        setStatus('saved');
      }
    } catch (err) {
      inFlight.current = false;
      const apiError = err as ApiError;
      if (apiError.code === 'version_conflict') {
        setStatus('conflict');
        return; // stop autosaving; the user must reload to avoid clobbering someone else's work
      }
      // Re-queue the failed changes (newer edits win) and let the user retry.
      pending.current = { ...changes, ...pending.current };
      setErrorMessage(apiError.message);
      setStatus('error');
    }
  }, [initial.id]);

  const queue = useCallback(
    (changes: { title?: string; content?: string; pageSetup?: PageSetup }) => {
      lastTyped.current = Date.now();
      pending.current = { ...pending.current, ...changes };
      setStatus((s) => (s === 'conflict' ? s : 'pending'));
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    },
    [flush],
  );

  const editor = useEditor({
    extensions: buildExtensions(editable, { getMetrics: () => metrics.current, onPages: setPages }),
    content: initial.content,
    editable,
    onUpdate: ({ editor }) => queue({ content: editor.getHTML() }),
  });

  /** Replaces the editor content with the latest saved version, keeping the cursor roughly in place. */
  const applyRemote = useCallback(
    (document: DocumentFull) => {
      if (!editor) return;
      const { from, to } = editor.state.selection;
      editor.commands.setContent(document.content, { emitUpdate: false });
      const max = editor.state.doc.content.size;
      editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      version.current = document.version;
      setTitle(document.title);
      committedTitle.current = document.title;
      if (document.pageSetup) setPageSetup(document.pageSetup);
      setLastEdit({ at: document.updatedAt, by: document.updatedBy });
    },
    [editor],
  );

  // Presence heartbeat + live refresh when someone else saves and we have nothing unsaved.
  useEffect(() => {
    let cancelled = false;
    const beat = async () => {
      try {
        const info = await api.presence(initial.id, editable && Date.now() - lastTyped.current < EDITING_WINDOW_MS);
        if (cancelled) return;
        setPresence(info);
        const idle = !inFlight.current && Object.keys(pending.current).length === 0;
        if (info.version > version.current && idle && status !== 'conflict') {
          const { document } = await api.getDocument(initial.id);
          if (cancelled || Object.keys(pending.current).length > 0) return;
          applyRemote(document);
          setHistoryKey((k) => k + 1);
          showToast(`Updated with ${document.updatedBy?.name.split(' ')[0] ?? 'a collaborator'}'s latest changes`);
        }
      } catch {
        /* presence is best effort */
      }
    };
    void beat();
    const interval = window.setInterval(beat, PRESENCE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [initial.id, editable, applyRemote, showToast, status]);

  useEffect(() => () => api.leave(initial.id), [initial.id]);

  // Track the space available for the page.
  useEffect(() => {
    const el = scrollArea.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setScrollWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, [preview]);

  // Page size, margins or the available width changed: lay the pages out again.
  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.view.dispatch(editor.state.tr.setMeta(REMEASURE, true).setMeta('addToHistory', false));
  }, [editor, paged, geometry.width, geometry.height, geometry.margins.top, geometry.margins.bottom, geometry.margins.left, geometry.margins.right]);

  const commitPageSetup = (next: PageSetup) => {
    setPageSetup(next);
    queue({ pageSetup: next });
  };

  // Warn before leaving with unsaved changes; flush on unmount (e.g. navigating back to the list).
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (Object.keys(pending.current).length > 0 || inFlight.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      void flush();
    };
  }, [flush]);

  /** Saves any pending edits and waits for them, so downloads and restores work on what is on screen. */
  const saveNow = async () => {
    for (let i = 0; i < 50 && (inFlight.current || Object.keys(pending.current).length > 0); i++) {
      await flush();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (inFlight.current || Object.keys(pending.current).length > 0) {
      throw new Error('Your latest changes are not saved yet. Try again in a moment.');
    }
  };

  const download = async (format: ExportFormat) => {
    if (editable) await saveNow();
    await api.downloadDocument(initial.id, format, title);
  };

  /** "Save as PDF" via the print dialog. Skip the title if the document already opens with the same heading. */
  const printPdf = () => {
    const first = editor?.state.doc.firstChild;
    const duplicate = first?.type.name === 'heading' && first.textContent.trim() === title.trim();
    document.body.dataset.printTitle = duplicate ? 'hide' : 'show';
    const m = pageSetup.margins;
    let style = document.getElementById('print-page-setup');
    if (!style) {
      style = document.createElement('style');
      style.id = 'print-page-setup';
      document.head.appendChild(style);
    }
    style.textContent = `@page { size: ${geometry.widthMm}mm ${geometry.heightMm}mm; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }`;
    window.print();
  };

  const restore = async (entry: VersionEntry) => {
    await saveNow();
    const { document } = await api.restoreVersion(initial.id, entry.id, version.current);
    applyRemote(document);
    setPreview(null);
    setHistoryKey((k) => k + 1);
    showToast('Version restored. The previous state is still in History.');
  };

  const openComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    let quote = editor.state.doc.textBetween(from, to, ' ').trim();
    if (!quote) {
      // Read-only editors (viewers/commenters) don't track selection, so use the browser's selection
      // when it lies inside the document.
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && editor.view.dom.contains(selection.anchorNode)) {
        quote = selection.toString().trim();
      }
    }
    setCommentQuote(quote || null);
    setPanel('comments');
  };

  /** Scrolls to and selects the first occurrence of a comment's quoted text. */
  const revealQuote = (quote: string) => {
    if (!editor) return;
    let found: { from: number; to: number } | null = null;
    editor.state.doc.descendants((node, pos) => {
      if (found || !node.isText || !node.text) return !found;
      const index = node.text.indexOf(quote);
      if (index >= 0) found = { from: pos + index, to: pos + index + quote.length };
      return !found;
    });
    if (found) {
      editor.chain().focus().setTextSelection(found).scrollIntoView().run();
    } else {
      showToast('That text is no longer in the document.');
    }
  };

  const commitTitle = () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitle(initial.title); // empty titles are not allowed; revert
      return;
    }
    if (trimmed !== title) setTitle(trimmed);
    if (trimmed !== committedTitle.current) {
      committedTitle.current = trimmed;
      queue({ title: trimmed });
    }
  };

  const togglePanel = (next: Exclude<Panel, null>) => {
    setPanel((current) => (current === next ? null : next));
    if (next === 'comments') setCommentQuote(null);
    if (next !== 'history') setPreview(null);
  };

  const counts = useEditorState({
    editor,
    selector: ({ editor }) => ({
      words: editor?.storage.characterCount.words() ?? 0,
      characters: editor?.storage.characterCount.characters() ?? 0,
    }),
  });

  const others = presence?.active ?? [];

  return (
    <div className="page-frame editor-frame">
      {/* Frozen document header */}
      <header className="editor-header">
        <Link to="/" className="icon-btn" aria-label="Back to documents" title="Back to documents">
          <Icon name="back" />
        </Link>
        <div className="editor-title-block">
          <input
            className="title-input"
            value={title}
            maxLength={200}
            readOnly={!editable}
            autoFocus={Boolean((location.state as { focusTitle?: boolean } | null)?.focusTitle)}
            onFocus={(e) => editable && e.target.select()}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editor) {
                e.preventDefault();
                // Move into the document synchronously, so the next keystrokes land in the page, not the title.
                editor.chain().setTextSelection(1).run();
                editor.view.focus();
              }
            }}
            aria-label="Document title"
          />
          <p className="editor-meta">
            <span className={`badge badge-${initial.role}`}>{initial.role === 'owner' ? 'Owner' : ROLE_LABEL[initial.role]}</span>
            {initial.role !== 'owner' && <span className="hide-sm">Owned by {initial.owner.name} ·</span>}
            <span className="hide-sm">
              Edited {timeAgo(lastEdit.at)}
              {lastEdit.by && ` by ${lastEdit.by.id === me.id ? 'you' : lastEdit.by.name}`}
            </span>
            <SaveIndicator status={status} canEdit={editable} onRetry={() => void flush()} />
          </p>
        </div>

        <div className="editor-header-actions">
          {others.length > 0 && (
            <div className="presence" aria-label="People here now">
              {others.slice(0, 4).map(({ user, editing }) => (
                <span key={user.id} className={`avatar presence-avatar${editing ? ' editing' : ''}`} title={`${user.name} · ${editing ? 'editing' : 'viewing'}`}>
                  {user.name[0]}
                </span>
              ))}
              {others.length > 4 && <span className="avatar presence-avatar more">+{others.length - 4}</span>}
              <span className="presence-label hide-md">
                {others.length === 1 ? `${others[0].user.name.split(' ')[0]} is ${others[0].editing ? 'editing' : 'viewing'}` : `${others.length} others here`}
              </span>
            </div>
          )}
          <HeaderToggle icon="outline" label="Outline" active={outline === 'open'} onClick={() => setOutline(outline === 'open' ? 'closed' : 'open')} />
          <HeaderToggle icon="comment" label="Comments" active={panel === 'comments'} badge={commentCount} onClick={() => togglePanel('comments')} />
          <HeaderToggle icon="history" label="History" active={panel === 'history'} onClick={() => togglePanel('history')} />
          <DownloadMenu onDownload={download} onPrint={printPdf} />
          {initial.role === 'owner' && (
            <button className="btn btn-primary" onClick={() => setSharing(true)}>
              <Icon name="share" /> <span className="hide-sm">Share</span>
            </button>
          )}
        </div>
      </header>

      {status === 'conflict' && (
        <div className="banner banner-warn" role="alert">
          Someone else saved changes while you were editing. Your latest edits were not saved.
          <button className="btn btn-sm" onClick={() => window.location.reload()}>Reload latest</button>
        </div>
      )}
      {status === 'error' && <div className="banner banner-error" role="alert">Save failed: {errorMessage}</div>}

      {/* Frozen toolbar */}
      {editable && editor ? (
        <Toolbar editor={editor} onComment={openComment} />
      ) : (
        <div className="toolbar toolbar-readonly">
          <Icon name="eye" />
          {commentable ? 'You can view and comment on this document. Select text, then add a comment.' : 'You have view-only access to this document.'}
          {commentable && (
            <button className="btn btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={openComment}>
              <Icon name="comment" size={14} /> Comment
            </button>
          )}
        </div>
      )}

      <div className="editor-workspace">
        {outline === 'open' && editor && <OutlinePanel editor={editor} pages={pages} onClose={() => setOutline('closed')} />}
        <div
          ref={scrollArea}
          className={`editor-scroll${paged ? ' paged' : ''}`}
          style={
            {
              '--page-w': `${geometry.width}px`,
              '--page-h': `${geometry.height}px`,
              '--mt': `${geometry.margins.top}px`,
              '--mr': `${geometry.margins.right}px`,
              '--mb': `${geometry.margins.bottom}px`,
              '--ml': `${geometry.margins.left}px`,
              '--page-gap': `${PAGE_GAP_PX}px`,
            } as React.CSSProperties
          }
        >
          {paged && !preview && (
            <div className="ruler-bar">
              <Ruler setup={pageSetup} editable={editable} onPreview={setPageSetup} onCommit={commitPageSetup} />
            </div>
          )}
          {preview ? (
            <div className="paper paper-preview">
              <div className="preview-banner">
                <span>
                  Previewing <strong>{new Date(preview.updatedAt).toLocaleString()}</strong>
                  {preview.author && ` · ${preview.author.name}`}
                </span>
                <span className="preview-actions">
                  {editable && (
                    <button className="btn btn-sm btn-primary" onClick={() => void restore(preview).catch((e) => showToast((e as Error).message))}>
                      <Icon name="restore" size={14} /> Restore this version
                    </button>
                  )}
                  <button className="btn btn-sm" onClick={() => setPreview(null)}>Back to current</button>
                </span>
              </div>
              {/* Version content is sanitized by the server before it is stored. */}
              <div className="prose"><div className="tiptap" dangerouslySetInnerHTML={{ __html: preview.content || '<p><em>Empty document</em></p>' }} /></div>
            </div>
          ) : (
            <>
              <div className="paper">
                <EditorContent editor={editor} className="prose" />
              </div>
              {editable && editor && <AddBlock editor={editor} />}
            </>
          )}
        </div>

        {panel === 'comments' && (
          <CommentsPanel
            documentId={initial.id}
            role={initial.role}
            me={me}
            quote={commentQuote}
            onClearQuote={() => setCommentQuote(null)}
            onReveal={revealQuote}
            onCount={setCommentCount}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'history' && (
          <HistoryPanel
            key={historyKey}
            documentId={initial.id}
            selectedId={preview?.id ?? null}
            onSelect={setPreview}
            onClose={() => {
              setPanel(null);
              setPreview(null);
            }}
          />
        )}
      </div>

      <footer className="editor-statusbar">
        <span>{counts?.words ?? 0} words</span>
        <span>{counts?.characters ?? 0} characters</span>
        <span className="statusbar-spacer" />
        <span>{pages} {pages === 1 ? 'page' : 'pages'}</span>
        <button className="statusbar-btn hide-sm" onClick={() => setPageSetupOpen(true)} title="Page size and margins">
          <Icon name="page" size={13} /> {pageSetup.size} · {pageSetup.orientation === 'portrait' ? 'Portrait' : 'Landscape'} · Margins
        </button>
        <span className="hide-sm">{editable ? 'Autosave on' : ROLE_LABEL[initial.role]}</span>
      </footer>

      {pageSetupOpen && (
        <PageSetupDialog
          setup={pageSetup}
          editable={editable}
          onClose={() => setPageSetupOpen(false)}
          onApply={(next) => {
            commitPageSetup(next);
            setPageSetupOpen(false);
          }}
        />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
      {sharing && <ShareDialog documentId={initial.id} onClose={() => setSharing(false)} />}
    </div>
  );
}

function HeaderToggle(props: { icon: IconName; label: string; active: boolean; badge?: number; onClick: () => void }) {
  return (
    <button className={`btn header-toggle${props.active ? ' active' : ''}`} aria-pressed={props.active} title={props.label} onClick={props.onClick}>
      <Icon name={props.icon} />
      <span className="hide-md">{props.label}</span>
      {props.badge ? <span className="toggle-badge">{props.badge}</span> : null}
    </button>
  );
}

function SaveIndicator({ status, canEdit, onRetry }: { status: SaveStatus; canEdit: boolean; onRetry: () => void }) {
  if (!canEdit) return null;
  const labels: Record<SaveStatus, string> = {
    saved: 'Saved',
    pending: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Not saved',
    conflict: 'Conflict',
  };
  return (
    <span className={`save-status save-${status}`} aria-live="polite">
      {labels[status]}
      {status === 'error' && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </span>
  );
}

function Toolbar({ editor, onComment }: { editor: Editor; onComment: () => void }) {
  // Re-render only when the formatting state at the cursor changes.
  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      code: editor.isActive('code'),
      codeBlock: editor.isActive('codeBlock'),
      task: editor.isActive('taskList'),
      bulletStyle: currentListStyle(editor, 'bulletList'),
      numberStyle: currentListStyle(editor, 'orderedList'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
      hasSelection: !editor.state.selection.empty,
    }),
  });

  const chain = () => editor.chain().focus();
  const blockType = state.h1 ? 'h1' : state.h2 ? 'h2' : state.h3 ? 'h3' : 'p';

  const setBlockType = (value: string) => {
    if (value === 'p') editor.chain().setParagraph().run();
    else editor.chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
    // Return focus to the page synchronously (chain().focus() waits a frame), so the first
    // character typed after choosing a style is not lost.
    editor.view.focus();
  };

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar-group">
        <Tool icon="undo" label="Undo (Ctrl+Z)" disabled={!state.canUndo} onClick={() => chain().undo().run()} />
        <Tool icon="redo" label="Redo (Ctrl+Shift+Z)" disabled={!state.canRedo} onClick={() => chain().redo().run()} />
      </div>
      <div className="toolbar-group">
        <select className="style-select" value={blockType} onChange={(e) => setBlockType(e.target.value)} aria-label="Text style">
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
        </select>
      </div>
      <div className="toolbar-group">
        <Tool icon="bold" label="Bold (Ctrl+B)" active={state.bold} onClick={() => chain().toggleBold().run()} />
        <Tool icon="italic" label="Italic (Ctrl+I)" active={state.italic} onClick={() => chain().toggleItalic().run()} />
        <Tool icon="underline" label="Underline (Ctrl+U)" active={state.underline} onClick={() => chain().toggleUnderline().run()} />
        <Tool icon="strike" label="Strikethrough (Ctrl+Shift+S)" active={state.strike} onClick={() => chain().toggleStrike().run()} />
        <Tool icon="code" label="Inline code (Ctrl+E)" active={state.code} onClick={() => chain().toggleCode().run()} />
      </div>
      <div className="toolbar-group">
        <ListMenu
          icon="bulletList"
          label="Bulleted list (Ctrl+Shift+8)"
          active={state.bullet}
          current={state.bulletStyle}
          options={BULLET_STYLES}
          onRemove={() => chain().toggleBulletList().run()}
          onPick={(style) => setListStyle(editor, 'bulletList', style)}
        />
        <ListMenu
          icon="orderedList"
          label="Numbered list (Ctrl+Shift+7)"
          active={state.ordered}
          current={state.numberStyle}
          options={NUMBER_STYLES}
          onRemove={() => chain().toggleOrderedList().run()}
          onPick={(style) => setListStyle(editor, 'orderedList', style)}
        />
        <Tool icon="checklist" label="Checklist (Ctrl+Shift+9)" active={state.task} onClick={() => chain().toggleTaskList().run()} />
      </div>
      <div className="toolbar-group">
        <Tool icon="quote" label="Quote (Ctrl+Shift+B)" active={state.quote} onClick={() => chain().toggleBlockquote().run()} />
        <Tool icon="codeBlock" label="Code cell (Ctrl+Alt+C)" active={state.codeBlock} onClick={() => chain().toggleCodeBlock({ language: 'python' }).run()} />
        <Tool icon="rule" label="Divider" onClick={() => chain().setHorizontalRule().run()} />
        <Tool icon="page" label="New page (Ctrl+Enter)" onClick={() => chain().insertPageBreak().run()} />
      </div>
      <div className="toolbar-group">
        <Tool icon="clear" label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()} />
      </div>
      <div className="toolbar-spacer" />
      <button
        type="button"
        className="btn btn-sm toolbar-comment"
        title={state.hasSelection ? 'Comment on the selected text' : 'Add a comment'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onComment}
      >
        <Icon name="comment" size={14} /> <span className="hide-sm">Comment</span>
      </button>
    </div>
  );
}

function Tool(props: { icon: IconName; label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`tool${props.active ? ' active' : ''}`}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      // Keep the editor selection while clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

function ListMenu(props: {
  icon: IconName;
  label: string;
  active: boolean;
  current: string | null;
  options: readonly { id: string; label: string; sample: string }[];
  onRemove: () => void;
  onPick: (style: string) => void;
}) {
  const name = props.label.split(' (')[0];
  return (
    <Dropdown
      trigger={(open, toggle) => (
        <button
          type="button"
          className={`tool tool-with-caret${props.active || open ? ' active' : ''}`}
          title={`${props.label} — choose a style`}
          aria-label={`${name}: choose a style`}
          aria-haspopup="menu"
          aria-expanded={open}
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggle}
        >
          <Icon name={props.icon} />
          <Icon name="caret" size={10} />
        </button>
      )}
    >
      {(close) => (
        <div className="style-picker">
          <p className="dropdown-title">{name} style</p>
          <div className="style-grid">
            {props.options.map((option) => (
              <button
                key={option.id}
                type="button"
                role="menuitem"
                className={props.current === option.id ? 'active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  props.onPick(option.id);
                  close();
                }}
              >
                <span className="style-sample">{option.sample}</span>
                <span className="style-label">{option.label}</span>
              </button>
            ))}
          </div>
          {props.active && (
            <button
              type="button"
              className="style-remove"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                props.onRemove();
                close();
              }}
            >
              <Icon name="close" size={13} /> Remove list
            </button>
          )}
        </div>
      )}
    </Dropdown>
  );
}
