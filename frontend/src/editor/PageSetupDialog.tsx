import { useEffect, useState, type FormEvent } from 'react';
import type { PageSetup } from '../api';
import { Icon } from '../components/Icons';
import { MARGIN_PRESETS, MIN_TEXT_WIDTH_MM, PAGE_SIZES_MM } from './page';

type Side = keyof PageSetup['margins'];
const SIDES: Side[] = ['top', 'bottom', 'left', 'right'];

/** Page size, orientation and margins (edited in centimetres, stored in millimetres). */
export function PageSetupDialog(props: { setup: PageSetup; editable: boolean; onApply: (setup: PageSetup) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<PageSetup>(props.setup);
  const [cm, setCm] = useState<Record<Side, string>>(() => toCm(props.setup.margins));
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  const applyPreset = (margins: PageSetup['margins']) => {
    setDraft((d) => ({ ...d, margins }));
    setCm(toCm(margins));
    setError('');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const margins = {} as PageSetup['margins'];
    for (const side of SIDES) {
      const value = Number(cm[side].replace(',', '.'));
      if (!Number.isFinite(value) || value < 0 || value > 10) {
        setError('Margins must be between 0 and 10 cm.');
        return;
      }
      margins[side] = Math.round(value * 100) / 10;
    }
    let [w, h] = PAGE_SIZES_MM[draft.size];
    if (draft.orientation === 'landscape') [w, h] = [h, w];
    if (margins.left + margins.right > w - MIN_TEXT_WIDTH_MM || margins.top + margins.bottom > h - MIN_TEXT_WIDTH_MM) {
      setError('Margins are too large for this page size.');
      return;
    }
    props.onApply({ ...draft, margins });
  };

  const activePreset = MARGIN_PRESETS.find((p) => SIDES.every((s) => Math.abs(p.margins[s] - Number(cm[s]) * 10) < 0.05))?.id;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <form className="modal card page-setup" role="dialog" aria-modal="true" aria-labelledby="page-setup-title" onSubmit={submit}>
        <div className="modal-head">
          <h2 id="page-setup-title">Page setup</h2>
          <button type="button" className="icon-btn" onClick={props.onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <fieldset disabled={!props.editable}>
          <div className="page-setup-row">
            <label>
              Paper size
              <select value={draft.size} onChange={(e) => setDraft({ ...draft, size: e.target.value as PageSetup['size'] })}>
                <option value="A4">A4 (21 × 29.7 cm)</option>
                <option value="Letter">Letter (21.6 × 27.9 cm)</option>
                <option value="Legal">Legal (21.6 × 35.6 cm)</option>
              </select>
            </label>
            <div className="orientation" role="radiogroup" aria-label="Orientation">
              <span className="label">Orientation</span>
              {(['portrait', 'landscape'] as const).map((o) => (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={draft.orientation === o}
                  className={draft.orientation === o ? 'active' : ''}
                  onClick={() => setDraft({ ...draft, orientation: o })}
                >
                  <span className={`orientation-icon ${o}`} /> {o === 'portrait' ? 'Portrait' : 'Landscape'}
                </button>
              ))}
            </div>
          </div>

          <h3>Margins</h3>
          <div className="presets">
            {MARGIN_PRESETS.map((p) => (
              <button key={p.id} type="button" className={activePreset === p.id ? 'active' : ''} onClick={() => applyPreset(p.margins)}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="margin-grid">
            {SIDES.map((side) => (
              <label key={side}>
                {side[0].toUpperCase() + side.slice(1)}
                <span className="unit-input">
                  <input
                    inputMode="decimal"
                    value={cm[side]}
                    onChange={(e) => {
                      setCm({ ...cm, [side]: e.target.value });
                      setError('');
                    }}
                  />
                  <span>cm</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button type="button" className="btn" onClick={props.onClose}>Cancel</button>
          {props.editable && <button className="btn btn-primary">Apply</button>}
        </div>
      </form>
    </div>
  );
}

function toCm(margins: PageSetup['margins']): Record<Side, string> {
  return Object.fromEntries(SIDES.map((s) => [s, String(Math.round(margins[s]) / 10 === margins[s] / 10 ? margins[s] / 10 : +(margins[s] / 10).toFixed(2))])) as Record<Side, string>;
}
