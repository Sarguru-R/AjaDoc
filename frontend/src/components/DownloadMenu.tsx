import { useEffect, useRef, useState } from 'react';
import type { ExportFormat } from '../api';

const OPTIONS: { id: ExportFormat | 'pdf'; label: string; hint: string }[] = [
  { id: 'docx', label: 'Word document', hint: '.docx' },
  { id: 'pdf', label: 'PDF', hint: 'Save as PDF' },
  { id: 'md', label: 'Markdown', hint: '.md' },
  { id: 'html', label: 'Web page', hint: '.html' },
  { id: 'txt', label: 'Plain text', hint: '.txt' },
];

/** "Download" button with a format menu. PDF uses the browser's print dialog ("Save as PDF"). */
export function DownloadMenu({ onDownload, onPrint }: { onDownload: (format: ExportFormat) => Promise<void>; onPrint: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = async (id: ExportFormat | 'pdf') => {
    setError('');
    if (id === 'pdf') {
      setOpen(false);
      onPrint();
      return;
    }
    setBusy(id);
    try {
      await onDownload(id);
      setOpen(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="download" ref={root}>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
          <path d="M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="hide-sm">Download</span>
      </button>
      {open && (
        <div className="download-menu" role="menu">
          <p className="download-title">Download as</p>
          {OPTIONS.map((option) => (
            <button key={option.id} type="button" role="menuitem" disabled={busy !== null} onClick={() => choose(option.id)}>
              <span>{option.label}</span>
              <span className="download-hint">{busy === option.id ? 'Preparing…' : option.hint}</span>
            </button>
          ))}
          {error && <p className="download-error" role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}
