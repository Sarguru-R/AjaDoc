/**
 * A miniature, non-interactive rendering of a document page (like a print preview thumbnail).
 * Only trusted HTML is passed in: built-in templates, or document content that the server sanitized.
 */
export function Thumbnail({ html, accent }: { html: string; accent?: string }) {
  return (
    <div className="thumb" aria-hidden="true">
      {accent && <span className="thumb-accent" style={{ background: accent }} />}
      <div className="thumb-page prose">
        <div className="tiptap" dangerouslySetInnerHTML={{ __html: html || '<p></p>' }} />
      </div>
    </div>
  );
}
