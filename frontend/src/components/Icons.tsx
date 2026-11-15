/** Small stroke icon set (16x16 grid, currentColor) used by the toolbar and panels. */
const PATHS = {
  undo: 'M5.5 3.5 2.5 6.5l3 3M2.5 6.5h7a4 4 0 0 1 0 8H7',
  redo: 'M10.5 3.5l3 3-3 3M13.5 6.5h-7a4 4 0 0 0 0 8H9',
  bold: 'M4.5 2.5h4.25a2.75 2.75 0 0 1 0 5.5H4.5zM4.5 8h5a3 3 0 0 1 0 6h-5z',
  italic: 'M6.5 2.5h6M3.5 13.5h6M9.5 2.5l-3 11',
  underline: 'M4 2.5v5a4 4 0 0 0 8 0v-5M3 14h10',
  strike: 'M2.5 8h11M11 4.5C10.5 3.3 9.4 2.5 8 2.5c-1.9 0-3.2 1.1-3.2 2.6M5 11.5c.5 1.2 1.6 2 3 2 1.9 0 3.2-1.1 3.2-2.6',
  code: 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5',
  bulletList: 'M6 4h8M6 8h8M6 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01',
  orderedList: 'M6.5 4h7.5M6.5 8h7.5M6.5 12h7.5M2 2.5h1v3M2 5.5h2M2 9.5c0-.6.4-1 1-1s1 .4 1 .9c0 .9-2 1.4-2 2.6h2',
  quote: 'M3 7.5h3v4H3zM3 7.5C3 5 4 3.8 6 3.5M9.5 7.5h3v4h-3zM9.5 7.5c0-2.5 1-3.7 3-4',
  rule: 'M2 8h12M5 5.5 2.5 8 5 10.5M11 5.5 13.5 8 11 10.5',
  clear: 'M3 13.5h6M7.5 2.5l-2.6 8.2M4.5 2.5h7M10.5 9.5l3.5 3.5M14 9.5 10.5 13',
  comment: 'M2.5 3.5h11v7.5H8l-3 2.5v-2.5H2.5z',
  history: 'M2.5 8a5.5 5.5 0 1 0 1.6-3.9M2.5 2.5v2.6h2.6M8 5v3.2l2.2 1.3',
  download: 'M8 2v8M4.5 6.8 8 10.3l3.5-3.5M2.5 13.5h11',
  share: 'M10.5 5.5a2 2 0 1 0 0-.01M5.5 10a2 2 0 1 0 0-.01M10.5 14a2 2 0 1 0 0-.01M7.3 9 9 7.5M7.3 11 9 12.5',
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM14 14l-3.5-3.5',
  doc: 'M4 1.5h5.5l3 3v10H4zM9.5 1.5v3h3M6 8h4.5M6 11h3',
  plus: 'M8 3v10M3 8h10',
  upload: 'M8 11V3M4.5 6.2 8 2.7l3.5 3.5M2.5 13.5h11',
  close: 'M4 4l8 8M12 4l-8 8',
  check: 'M3 8.5 6.5 12 13 4.5',
  reopen: 'M3.5 8a4.5 4.5 0 1 0 1.3-3.2M3.5 3v2.6h2.6',
  trash: 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9',
  back: 'M10 3.5 5.5 8l4.5 4.5',
  more: 'M3.5 8h.01M8 8h.01M12.5 8h.01',
  restore: 'M3 8a5 5 0 1 0 1.5-3.6M3 3v2.5h2.5',
  eye: 'M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  checklist: 'M2.5 3.5 3.7 4.7 5.5 2.8M2.5 8l1.2 1.2L5.5 7.3M2.5 12.5l1.2 1.2 1.8-1.9M8 4h6M8 8.5h6M8 13h6',
  codeBlock: 'M2 2.5h12v11H2zM5 6.5 3.5 8 5 9.5M8 6.5l1.5 1.5L8 9.5M10.5 10h2',
  page: 'M3.5 1.5h6l3 3v10h-9zM9.5 1.5v3h3M8 7v5M5.5 9.5h5',
  text: 'M3 4h10M3 8h10M3 12h6',
  heading: 'M3.5 2.5v11M10.5 2.5v11M3.5 8h7M13 13.5V9',
  outline: 'M2.5 3.5h11M4.5 7h9M4.5 10.5h9M2.5 14h11',
  caret: 'M4.5 6.5 8 10l3.5-3.5',
  width: 'M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5l2.5 2.5-2.5 2.5',
  grid: 'M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z',
  refresh: 'M13 3v3.5H9.5M3 13V9.5h3.5M12.5 6.5A5 5 0 0 0 3.6 5M3.5 9.5a5 5 0 0 0 8.9 1.5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, className }: { name: IconName; size?: number; className?: string }) {
  const dot = name === 'bulletList' || name === 'more';
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={dot ? 1.6 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} strokeWidth={name === 'more' ? 2.6 : undefined} />
    </svg>
  );
}
