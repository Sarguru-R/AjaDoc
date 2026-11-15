import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Print-layout pagination, like Google Docs' page view.
 *
 * The document stays one ProseMirror document. After each change we measure the top-level blocks and,
 * where a block would cross the bottom margin of the current page, insert a "page gap" widget before it.
 * The widget is as tall as the space left on the page + bottom margin + the gap between sheets + the next
 * page's top margin, so the block starts at the top of the next page. Manual page breaks force a gap.
 * Blocks taller than a page (a very long table or code cell) are not split; they extend their page.
 *
 * Measurements subtract the widgets we already inserted, so the result does not depend on itself and
 * the layout settles after one pass.
 */

export interface PageMetrics {
  enabled: boolean;
  pageHeight: number;
  marginTop: number;
  marginBottom: number;
  gap: number;
}

interface Break {
  pos: number;
  height: number;
  page: number; // the page that starts after this gap
}

interface PaginationState {
  breaks: Break[];
  deco: DecorationSet;
}

export const paginationKey = new PluginKey<PaginationState>('pagination');
export const REMEASURE = 'pagination-remeasure';

function gapWidget(b: Break): HTMLElement {
  const el = document.createElement('div');
  el.className = 'page-gap';
  el.contentEditable = 'false';
  el.style.height = `${b.height}px`;
  const footer = document.createElement('span');
  footer.className = 'page-gap-number';
  footer.textContent = String(b.page - 1);
  el.appendChild(footer);
  return el;
}

function buildDecorations(state: EditorState, breaks: Break[]): DecorationSet {
  return DecorationSet.create(
    state.doc,
    breaks.map((b) =>
      Decoration.widget(b.pos, () => gapWidget(b), { side: -1, key: `gap-${b.page}-${Math.round(b.height)}`, ignoreSelection: true }),
    ),
  );
}

function sameBreaks(a: Break[], b: Break[]) {
  return a.length === b.length && a.every((x, i) => x.pos === b[i].pos && Math.abs(x.height - b[i].height) < 1);
}

function measure(view: EditorView, metrics: PageMetrics, onPages: (pages: number) => void) {
  const current = paginationKey.getState(view.state);
  if (!current) return;
  const dom = view.dom as HTMLElement;

  if (!metrics.enabled) {
    dom.style.removeProperty('--page-filler');
    if (current.breaks.length) view.dispatch(view.state.tr.setMeta(paginationKey, []).setMeta('addToHistory', false));
    onPages(1);
    return;
  }

  const contentHeight = metrics.pageHeight - metrics.marginTop - metrics.marginBottom;
  const insertedBefore = (pos: number) => current.breaks.reduce((sum, b) => (b.pos <= pos ? sum + b.height : sum), 0);
  const gapFor = (spaceLeft: number) => Math.max(0, spaceLeft) + metrics.marginBottom + metrics.gap + metrics.marginTop;

  const breaks: Break[] = [];
  let pageStart = 0;
  let lastBottom = 0;
  let page = 1;

  view.state.doc.forEach((node, offset) => {
    const el = view.nodeDOM(offset);
    if (!(el instanceof HTMLElement)) return;
    const top = el.offsetTop - metrics.marginTop - insertedBefore(offset);
    const bottom = top + el.offsetHeight;
    const marginBelow = parseFloat(getComputedStyle(el).marginBottom) || 0;

    if (node.type.name === 'pageBreak') {
      page += 1;
      breaks.push({ pos: offset + node.nodeSize, height: gapFor(pageStart + contentHeight - bottom), page });
      pageStart = bottom;
      lastBottom = bottom;
      return;
    }
    if (bottom > pageStart + contentHeight + 1 && top > pageStart + 1) {
      page += 1;
      breaks.push({ pos: offset, height: gapFor(pageStart + contentHeight - top), page });
      pageStart = top;
    }
    lastBottom = bottom + marginBelow;
  });

  // Pad the last page to a full sheet.
  dom.style.setProperty('--page-filler', `${Math.max(0, pageStart + contentHeight - lastBottom)}px`);
  dom.dataset.lastPage = String(page);
  onPages(page);

  if (!sameBreaks(breaks, current.breaks)) {
    view.dispatch(view.state.tr.setMeta(paginationKey, breaks).setMeta('addToHistory', false));
  }
}

export const Pagination = Extension.create<{ getMetrics: () => PageMetrics; onPages: (pages: number) => void }>({
  name: 'pagination',

  addOptions() {
    return {
      getMetrics: () => ({ enabled: false, pageHeight: 0, marginTop: 0, marginBottom: 0, gap: 0 }),
      onPages: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ breaks: [], deco: DecorationSet.empty }),
          apply(tr, value, _oldState, newState) {
            const next = tr.getMeta(paginationKey) as Break[] | undefined;
            if (next) return { breaks: next, deco: buildDecorations(newState, next) };
            if (!tr.docChanged) return value;
            // Keep gaps attached to the right blocks until the next measurement.
            const breaks = value.breaks.map((b) => ({ ...b, pos: tr.mapping.map(b.pos, -1) }));
            return { breaks, deco: value.deco.map(tr.mapping, tr.doc) };
          },
        },
        props: {
          decorations: (state) => paginationKey.getState(state)?.deco,
        },
        view(view) {
          let frame = 0;
          const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => measure(view, options.getMetrics(), options.onPages));
          };
          schedule();
          void document.fonts?.ready.then(schedule);
          const resize = new ResizeObserver(schedule);
          resize.observe(view.dom);
          return {
            update: schedule,
            destroy() {
              cancelAnimationFrame(frame);
              resize.disconnect();
            },
          };
        },
      }),
    ];
  },
});
