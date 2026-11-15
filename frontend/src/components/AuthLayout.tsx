import type { ReactNode } from 'react';
import { Brand } from './Brand';

/** Shared two-column layout for the sign-in and sign-up pages: navy brand panel + form card. */
export function AuthLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return (
    <main className="login">
      <section className="login-hero">
        <Brand size="lg" />
        <p className="eyebrow">Document workspace</p>
        <h1>
          Write together.<br />
          <span className="accent-text">Ship faster.</span>
        </h1>
        <p className="login-lede">
          Create rich documents, import your existing files and share them with your team, with the right access for everyone.
        </p>
        <ul className="login-points">
          <li>Rich-text editing with autosave</li>
          <li>Import .txt, .md and .docx</li>
          <li>Share as editor or viewer</li>
        </ul>
      </section>

      <section className="login-panel">
        <div className="login-card">
          <p className="eyebrow eyebrow-dark">{eyebrow}</p>
          <h2>{title}</h2>
          {children}
        </div>
      </section>
    </main>
  );
}
