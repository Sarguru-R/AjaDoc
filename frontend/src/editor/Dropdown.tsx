import { useEffect, useRef, useState, type ReactNode } from 'react';

/** A small popover menu anchored to a trigger; closes on outside click, Escape or selection. */
export function Dropdown(props: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right' | 'center';
  placement?: 'below' | 'above';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

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

  return (
    <div className={`dropdown ${props.className ?? ''}`} ref={root}>
      {props.trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div className={`dropdown-menu align-${props.align ?? 'left'} ${props.placement === 'above' ? 'above' : ''}`} role="menu">
          {props.children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
