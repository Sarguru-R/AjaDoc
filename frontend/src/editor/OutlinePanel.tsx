import { useEditorState, type Editor } from '@tiptap/react';
import { Icon } from '../components/Icons';

interface Heading {
  level: number;
  text: string;
  pos: number;
}

/** Left-hand outline: every heading as a card; click to jump. The section you are in is highlighted. */
export function OutlinePanel({ editor, pages, onClose }: { editor: Editor; pages: number; onClose: () => void }) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) => {
      const headings: Heading[] = [];
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name === 'heading') headings.push({ level: node.attrs.level as number, text: node.textContent, pos });
      });
      const cursor = editor.state.selection.from;
      const active = headings.filter((h) => h.pos <= cursor).at(-1)?.pos ?? null;
      return { headings, active };
    },
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });

  const jump = (heading: Heading) => {
    editor.chain().focus().setTextSelection(heading.pos + 1).scrollIntoView().run();
    // Bring the heading near the top of the page area rather than the bottom edge.
    window.requestAnimationFrame(() => {
      const dom = editor.view.nodeDOM(heading.pos);
      const scroller = editor.view.dom.closest('.editor-scroll');
      if (dom instanceof HTMLElement && scroller) {
        // Scroll only the document area, leaving room for the sticky ruler.
        const offset = dom.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 64;
        scroller.scrollBy({ top: offset, behavior: 'smooth' });
      }
    });
  };

  return (
    <aside className="outline-panel" aria-label="Document outline">
      <div className="outline-head">
        <h2>Outline</h2>
        <span className="outline-meta">
          {state.headings.length} {state.headings.length === 1 ? 'section' : 'sections'} · {pages} {pages === 1 ? 'page' : 'pages'}
        </span>
        <button className="icon-btn" aria-label="Hide outline" title="Hide outline" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>
      <div className="outline-scroll">
        {state.headings.length === 0 ? (
          <div className="outline-empty">
            <Icon name="doc" size={22} />
            <p>Headings you add appear here as cards, so you can jump between sections.</p>
          </div>
        ) : (
          <ol className="outline-list">
            {state.headings.map((h) => (
              <li key={h.pos}>
                <button className={`outline-card level-${h.level}${state.active === h.pos ? ' active' : ''}`} onClick={() => jump(h)}>
                  <span className="outline-level">H{h.level}</span>
                  <span className="outline-text">{h.text || 'Untitled section'}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </aside>
  );
}
