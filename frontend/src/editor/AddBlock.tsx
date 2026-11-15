import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { Icon, type IconName } from '../components/Icons';
import { appendBlock, type BlockKind } from './extensions';

const OPTIONS: { kind: BlockKind; label: string; icon: IconName }[] = [
  { kind: 'page', label: 'Blank page', icon: 'page' },
  { kind: 'text', label: 'Text', icon: 'text' },
  { kind: 'h1', label: 'Heading 1', icon: 'heading' },
  { kind: 'h2', label: 'Heading 2', icon: 'heading' },
  { kind: 'h3', label: 'Heading 3', icon: 'heading' },
  { kind: 'bullet', label: 'Bullets', icon: 'bulletList' },
  { kind: 'ordered', label: 'Numbers', icon: 'orderedList' },
  { kind: 'checklist', label: 'Checklist', icon: 'checklist' },
  { kind: 'code', label: 'Code', icon: 'codeBlock' },
  { kind: 'quote', label: 'Quote', icon: 'quote' },
  { kind: 'divider', label: 'Divider', icon: 'rule' },
];

/**
 * The "+" under the last page, like a notebook's add-cell bar. It opens a horizontal row of block types;
 * whatever you pick is added on a NEW page (a page break is inserted first), so each addition starts
 * its own sheet.
 */
export function AddBlock({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Make sure the whole row of options is on screen, scrolling only the document area.
    window.requestAnimationFrame(() => {
      const bar = root.current?.querySelector('.add-block-bar');
      const scroller = root.current?.closest('.editor-scroll');
      if (!bar || !scroller) return;
      const overflow = bar.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 16;
      if (overflow > 0) scroller.scrollBy({ top: overflow, behavior: 'smooth' });
    });
    const onClick = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`add-block${open ? ' open' : ''}`} ref={root}>
      <span className="add-block-line" />
      <button
        type="button"
        className="add-block-btn"
        // Don't take focus from the editor, so the new page can be typed into immediately.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        title={open ? 'Close' : 'Add a new page'}
        aria-label={open ? 'Close add menu' : 'Add a new page'}
        aria-expanded={open}
      >
        <Icon name="plus" size={18} />
      </button>
      {open && (
        <div className="add-block-bar" role="menu" aria-label="Add a new page with">
          <span className="add-block-caption">New page with</span>
          {OPTIONS.map((option) => (
            <button
              key={option.kind}
              type="button"
              role="menuitem"
              className={option.kind === 'page' ? 'featured' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                appendBlock(editor, option.kind);
                setOpen(false);
              }}
            >
              <Icon name={option.icon} size={15} />
              {option.label}
            </button>
          ))}
        </div>
      )}
      <span className="add-block-line" />
    </div>
  );
}
