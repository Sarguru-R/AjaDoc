import { useId } from 'react';

/**
 * The AjaDoc mark: a document page with a folded corner, a bold "A" whose crossbar is an ink swoosh,
 * a line of text, and a pencil that has just written it. A small sparkle sits on the tile.
 *
 * The loader is the same drawing, animated: the pencil writes the swoosh across the "A", lifts,
 * writes the text line, then the ink fades and it starts again. The pencil follows the exact ink paths
 * (SVG <animateMotion>), so the tip and the line stay in sync.
 */

// Ink paths (viewBox 0 0 64 64).
const SWOOSH = 'M17 39.5 C23.5 31.5 32 28 44.5 28';
const UNDERLINE = 'M23 49.5 H34';
// Pencil route: swoosh, lift to the underline, write it, then return to the start.
const PENCIL_ROUTE = `${SWOOSH} L23 49.5 H34 L17 39.5`;
const SWOOSH_LEN = 31;
const UNDERLINE_LEN = 11;

const DURATION = '2.6s';
// Phase boundaries (fractions of the loop) and the matching positions along PENCIL_ROUTE.
const KEY_TIMES = '0;0.38;0.48;0.72;0.86;1';
const KEY_POINTS = '0;0.3361;0.6663;0.7858;0.7858;1';

function Pencil() {
  // Drawn pointing left with the tip at (0,0), then tilted so the body rises to the upper right.
  return (
    <g transform="rotate(-48) scale(0.9)">
      <path d="M0 0 L5.5 -2.6 L5.5 2.6 Z" className="aj-pencil-wood" />
      <path d="M0 0 L2 -0.95 L2 0.95 Z" className="aj-pencil-lead" />
      <rect x="5.5" y="-2.6" width="12" height="5.2" className="aj-pencil-body" />
      <rect x="17.5" y="-2.6" width="1.8" height="5.2" className="aj-pencil-band" />
      <path d="M19.3 -2.6 H21.2 a2.6 2.6 0 0 1 0 5.2 H19.3 Z" className="aj-pencil-eraser" />
    </g>
  );
}

function Mark({ animated }: { animated: boolean }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const tile = `aj-tile-${id}`;
  const ink = `aj-ink-${id}`;
  const loop = { dur: DURATION, repeatCount: 'indefinite' } as const;

  return (
    <>
      <defs>
        <linearGradient id={tile} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a2a86" />
          <stop offset="1" stopColor="#001d6b" />
        </linearGradient>
        <linearGradient id={ink} x1="17" y1="39.5" x2="44.5" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6a4cff" />
          <stop offset="1" stopColor="#3d8bff" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="14" fill={`url(#${tile})`} className="aj-tile" />

      {/* sparkle */}
      <path d="M12 7 Q12.6 11.4 17 12 Q12.6 12.6 12 17 Q11.4 12.6 7 12 Q11.4 11.4 12 7 Z" className="aj-sparkle">
        {animated && (
          <animate attributeName="opacity" values="0.35;1;0.35" dur="1.3s" repeatCount="indefinite" />
        )}
      </path>

      {/* page with folded corner */}
      <path d="M18 10 H39 L50 21 V51 a3 3 0 0 1 -3 3 H18 a3 3 0 0 1 -3 -3 V13 a3 3 0 0 1 3 -3 Z" className="aj-page" />
      <path d="M39 10 V18 a3 3 0 0 0 3 3 H50 Z" className="aj-fold" />

      {/* the "A" */}
      <path d="M19.5 43 L29.5 18 L39.5 43" className="aj-letter" />

      {/* ink: swoosh crossbar + text line */}
      <path
        d={SWOOSH}
        className="aj-swoosh"
        stroke={`url(#${ink})`}
        strokeDasharray={animated ? SWOOSH_LEN : undefined}
        strokeDashoffset={animated ? SWOOSH_LEN : undefined}
      >
        {animated && (
          <>
            <animate attributeName="stroke-dashoffset" values={`${SWOOSH_LEN};0;0;0;0;${SWOOSH_LEN}`} keyTimes={KEY_TIMES} {...loop} />
            <animate attributeName="opacity" values="1;1;1;1;0;0" keyTimes={KEY_TIMES} {...loop} />
          </>
        )}
      </path>
      <path
        d={UNDERLINE}
        className="aj-underline"
        strokeDasharray={animated ? UNDERLINE_LEN : undefined}
        strokeDashoffset={animated ? UNDERLINE_LEN : undefined}
      >
        {animated && (
          <>
            <animate attributeName="stroke-dashoffset" values={`${UNDERLINE_LEN};${UNDERLINE_LEN};${UNDERLINE_LEN};0;0;${UNDERLINE_LEN}`} keyTimes={KEY_TIMES} {...loop} />
            <animate attributeName="opacity" values="1;1;1;1;0;0" keyTimes={KEY_TIMES} {...loop} />
          </>
        )}
      </path>

      {/* pencil: resting at the end of the text line, or writing */}
      {animated ? (
        <g>
          <animateMotion path={PENCIL_ROUTE} keyPoints={KEY_POINTS} keyTimes={KEY_TIMES} calcMode="linear" {...loop} />
          <Pencil />
        </g>
      ) : (
        <g transform="translate(34.5 49.5)">
          <Pencil />
        </g>
      )}
    </>
  );
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Static mark, used in the wordmark and favicon. */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg className={`aj-mark ${className}`} viewBox="0 0 64 64" aria-hidden="true">
      <Mark animated={false} />
    </svg>
  );
}

/** Animated mark used as the app's loading indicator. */
export function Loader({ label = 'Loading…', size = 64, inline = false }: { label?: string; size?: number; inline?: boolean }) {
  const animated = !prefersReducedMotion();
  return (
    <div className={`aj-loader${inline ? ' aj-loader-inline' : ''}${animated ? '' : ' aj-loader-still'}`} role="status" aria-live="polite">
      <svg className="aj-mark" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
        <Mark animated={animated} />
      </svg>
      <span className="aj-loader-label">{label}</span>
    </div>
  );
}
