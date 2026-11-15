import { useRef, useState } from 'react';
import type { PageSetup } from '../api';
import { formatCm, MAX_MARGIN_MM, MIN_TEXT_WIDTH_MM, pageGeometry, PX_PER_MM } from './page';

type Side = 'left' | 'right';

/**
 * Horizontal ruler aligned with the page, like Google Docs. Drag the triangles to change the left and
 * right margins (snaps to 0.5 mm steps; hold Alt for free movement). The shaded ends are the margins.
 */
export function Ruler(props: { setup: PageSetup; editable: boolean; onPreview: (setup: PageSetup) => void; onCommit: (setup: PageSetup) => void }) {
  const { setup } = props;
  const geometry = pageGeometry(setup);
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<Side | null>(null);

  const startDrag = (side: Side) => (event: React.PointerEvent) => {
    if (!props.editable) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    setDragging(side);
    let latest = setup;

    const move = (e: PointerEvent) => {
      const rect = bar.current!.getBoundingClientRect();
      const scale = rect.width / geometry.width; // in case the page is displayed scaled
      const xMm = (e.clientX - rect.left) / scale / PX_PER_MM;
      let mm = side === 'left' ? xMm : geometry.widthMm - xMm;
      if (!e.altKey) mm = Math.round(mm * 2) / 2;
      const other = side === 'left' ? setup.margins.right : setup.margins.left;
      mm = Math.max(0, Math.min(mm, MAX_MARGIN_MM, geometry.widthMm - other - MIN_TEXT_WIDTH_MM));
      latest = { ...setup, margins: { ...setup.margins, [side]: mm } };
      props.onPreview(latest);
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      setDragging(null);
      props.onCommit(latest);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const nudge = (side: Side, deltaMm: number) => {
    const other = side === 'left' ? setup.margins.right : setup.margins.left;
    const mm = Math.max(0, Math.min(setup.margins[side] + deltaMm, MAX_MARGIN_MM, geometry.widthMm - other - MIN_TEXT_WIDTH_MM));
    props.onCommit({ ...setup, margins: { ...setup.margins, [side]: mm } });
  };

  const ticks = [];
  for (let mm = 0; mm <= geometry.widthMm; mm += 5) {
    const major = mm % 10 === 0;
    ticks.push(
      <span key={mm} className={`ruler-tick${major ? ' major' : ''}`} style={{ left: mm * PX_PER_MM }}>
        {major && mm > 0 && mm < geometry.widthMm - 2 && <i>{mm / 10}</i>}
      </span>,
    );
  }

  return (
    <div className="ruler" ref={bar} style={{ width: geometry.width }}>
      <span className="ruler-margin" style={{ left: 0, width: geometry.margins.left }} />
      <span className="ruler-margin" style={{ right: 0, width: geometry.margins.right }} />
      {ticks}
      {(['left', 'right'] as Side[]).map((side) => (
        <button
          key={side}
          type="button"
          className={`ruler-handle ${side}${dragging === side ? ' dragging' : ''}`}
          style={side === 'left' ? { left: geometry.margins.left } : { left: geometry.width - geometry.margins.right }}
          disabled={!props.editable}
          title={`${side === 'left' ? 'Left' : 'Right'} margin: ${formatCm(setup.margins[side])}${props.editable ? ' (drag, or use arrow keys)' : ''}`}
          aria-label={`${side === 'left' ? 'Left' : 'Right'} margin ${formatCm(setup.margins[side])}`}
          onPointerDown={startDrag(side)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const towardsInside = (side === 'left') === (e.key === 'ArrowRight');
              nudge(side, (towardsInside ? 1 : -1) * (e.shiftKey ? 5 : 1));
            }
          }}
        >
          {dragging === side && <span className="ruler-readout">{formatCm(setup.margins[side])}</span>}
        </button>
      ))}
    </div>
  );
}
