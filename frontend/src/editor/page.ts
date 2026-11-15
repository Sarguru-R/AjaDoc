import type { PageSetup } from '../api';

/** CSS pixels per millimetre (96 dpi). */
export const PX_PER_MM = 96 / 25.4;
export const PAGE_GAP_PX = 28;

export const PAGE_SIZES_MM: Record<PageSetup['size'], [number, number]> = {
  A4: [210, 297],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

export const MARGIN_PRESETS: { id: string; label: string; margins: PageSetup['margins'] }[] = [
  { id: 'normal', label: 'Normal', margins: { top: 25.4, right: 25.4, bottom: 25.4, left: 25.4 } },
  { id: 'narrow', label: 'Narrow', margins: { top: 12.7, right: 12.7, bottom: 12.7, left: 12.7 } },
  { id: 'moderate', label: 'Moderate', margins: { top: 25.4, right: 19.1, bottom: 25.4, left: 19.1 } },
  { id: 'wide', label: 'Wide', margins: { top: 25.4, right: 50.8, bottom: 25.4, left: 50.8 } },
];

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
}

/** Page size and margins in CSS pixels. */
export function pageGeometry(setup: PageSetup): PageGeometry {
  let [widthMm, heightMm] = PAGE_SIZES_MM[setup.size];
  if (setup.orientation === 'landscape') [widthMm, heightMm] = [heightMm, widthMm];
  const px = (mm: number) => mm * PX_PER_MM;
  return {
    widthMm,
    heightMm,
    width: px(widthMm),
    height: px(heightMm),
    margins: {
      top: px(setup.margins.top),
      right: px(setup.margins.right),
      bottom: px(setup.margins.bottom),
      left: px(setup.margins.left),
    },
  };
}

export const MIN_TEXT_WIDTH_MM = 40;
export const MAX_MARGIN_MM = 100;

export const formatCm = (mm: number) => `${(mm / 10).toFixed(mm % 10 === 0 ? 0 : 2).replace(/0$/, '')} cm`;
