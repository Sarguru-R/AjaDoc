import { LogoMark } from './Logo';

/** AjaDoc wordmark: the mark plus "Aja" in the current text colour and "Doc" in the accent blue. */
export function Brand({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={`brand brand-${size}`}>
      <LogoMark className="brand-glyph" />
      <span className="brand-word">
        Aja<span className="brand-accent">Doc</span>
      </span>
    </span>
  );
}
