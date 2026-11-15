import { mergeAttributes, Node, type Editor } from '@tiptap/core';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { BulletList, OrderedList, TaskItem, TaskList } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { common, createLowlight } from 'lowlight';
import { CodeCell } from './CodeCell';
import { Pagination, type PageMetrics } from './pagination';

export { CODE_LANGUAGES } from './languages';

export const BULLET_STYLES = [
  { id: 'disc', label: 'Disc', sample: '•' },
  { id: 'circle', label: 'Circle', sample: '◦' },
  { id: 'square', label: 'Square', sample: '▪' },
  { id: 'arrow', label: 'Arrow', sample: '➤' },
  { id: 'dash', label: 'Dash', sample: '–' },
  { id: 'check', label: 'Tick', sample: '✓' },
] as const;

export const NUMBER_STYLES = [
  { id: 'decimal', label: 'Numbers', sample: '1. 2. 3.' },
  { id: 'decimal-leading-zero', label: 'Padded', sample: '01. 02.' },
  { id: 'lower-alpha', label: 'Letters', sample: 'a. b. c.' },
  { id: 'upper-alpha', label: 'Capitals', sample: 'A. B. C.' },
  { id: 'lower-roman', label: 'Roman', sample: 'i. ii. iii.' },
  { id: 'upper-roman', label: 'Roman caps', sample: 'I. II. III.' },
] as const;

/** A list-style attribute stored as data-list-style (rendered with CSS, kept through save/export). */
const listStyleAttribute = {
  listStyle: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-list-style'),
    renderHTML: (attributes: { listStyle?: string | null }) => (attributes.listStyle ? { 'data-list-style': attributes.listStyle } : {}),
  },
};

const StyledBulletList = BulletList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listStyleAttribute };
  },
});

const StyledOrderedList = OrderedList.extend({
  addAttributes() {
    return { ...this.parent?.(), ...listStyleAttribute };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageBreak: { insertPageBreak: () => ReturnType };
  }
}

/** A page break: shown as the gap between two sheets, printed and exported as a real page break. */
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'hr[data-type="page-break"]', priority: 60 }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes, { 'data-type': 'page-break' })];
  },
  addCommands() {
    return {
      insertPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent([{ type: this.name }, { type: 'paragraph' }]).run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});

const lowlight = createLowlight(common);

export function buildExtensions(editable: boolean, pagination: { getMetrics: () => PageMetrics; onPages: (pages: number) => void }) {
  return [
    Pagination.configure(pagination),
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false },
      bulletList: false,
      orderedList: false,
      codeBlock: false,
    }),
    StyledBulletList,
    StyledOrderedList,
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return ReactNodeViewRenderer(CodeCell);
      },
    }).configure({ lowlight, defaultLanguage: 'plaintext', enableTabIndentation: true, tabSize: 4 }),
    PageBreak,
    Placeholder.configure({
      // Only while the whole document is empty (see the CSS for .is-editor-empty).
      placeholder: editable ? 'Start writing… Type # for a heading, - for a list, [] for a checklist, ``` for code.' : 'This document is empty.',
      showOnlyWhenEditable: false,
    }),
    CharacterCount,
  ];
}

/** Sets the style of the innermost list of `type` around the cursor, creating the list if needed. */
export function setListStyle(editor: Editor, type: 'bulletList' | 'orderedList', style: string) {
  const chain = editor.chain().focus();
  if (!editor.isActive(type)) {
    (type === 'bulletList' ? chain.toggleBulletList() : chain.toggleOrderedList()).run();
  }
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const { $from } = state.selection;
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === type) {
          const isDefault = style === 'disc' || style === 'decimal';
          tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, listStyle: isDefault ? null : style });
          return true;
        }
      }
      return false;
    })
    .run();
}

/** Current list style around the cursor (for highlighting the active option). */
export function currentListStyle(editor: Editor, type: 'bulletList' | 'orderedList'): string | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === type) return (node.attrs.listStyle as string | null) ?? (type === 'bulletList' ? 'disc' : 'decimal');
  }
  return null;
}

export type BlockKind = 'text' | 'h1' | 'h2' | 'h3' | 'bullet' | 'ordered' | 'checklist' | 'code' | 'quote' | 'divider' | 'page';

const BLOCK_JSON: Record<BlockKind, object | object[]> = {
  text: { type: 'paragraph' },
  h1: { type: 'heading', attrs: { level: 1 } },
  h2: { type: 'heading', attrs: { level: 2 } },
  h3: { type: 'heading', attrs: { level: 3 } },
  bullet: { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  ordered: { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }] },
  checklist: { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph' }] }] },
  code: { type: 'codeBlock', attrs: { language: 'python' } },
  quote: { type: 'blockquote', content: [{ type: 'paragraph' }] },
  divider: [{ type: 'horizontalRule' }, { type: 'paragraph' }],
  page: [{ type: 'pageBreak' }, { type: 'paragraph' }],
};

/** Adds a block at the end of the document on a NEW page (the "+" bar), and puts the cursor in it.
 * In an empty document the block simply replaces the empty first line. */
export function appendBlock(editor: Editor, kind: BlockKind) {
  const blocks = ([] as object[]).concat(kind === 'page' ? [{ type: 'paragraph' }] : BLOCK_JSON[kind]);
  if (editor.isEmpty) {
    editor.chain().insertContentAt({ from: 0, to: editor.state.doc.content.size }, blocks).focus('end').scrollIntoView().run();
    return;
  }
  editor
    .chain()
    .insertContentAt(editor.state.doc.content.size, [{ type: 'pageBreak' }, ...blocks])
    .focus('end')
    .scrollIntoView()
    .run();
}
