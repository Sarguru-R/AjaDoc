import { useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { CODE_LANGUAGES } from './languages';

/**
 * A code cell styled like an IDE: language picker, line numbers, copy button. The code is stored as
 * plain text inside <pre><code>, so indentation and syntax are never reformatted; highlighting is only
 * a visual layer. Tab indents (4 spaces), Shift+Tab outdents, three Enters or ↓ at the end leave the cell.
 */
export function CodeCell({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const language = (node.attrs.language as string | null) || 'plaintext';
  const lineCount = Math.max(1, node.textContent.split('\n').length);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) */
    }
  };

  return (
    <NodeViewWrapper className="code-cell" data-language={language}>
      <div className="code-cell-head" contentEditable={false}>
        <span className="code-cell-dots" aria-hidden="true">
          <i /> <i /> <i />
        </span>
        <select
          className="code-cell-lang"
          value={language}
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          aria-label="Code language"
        >
          {CODE_LANGUAGES.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <span className="code-cell-meta">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'}
          {editor.isEditable && ' · Tab indents · 3× Enter exits'}
        </span>
        <button type="button" className="code-cell-copy" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="code-cell-body">
        <div className="code-cell-gutter" contentEditable={false} aria-hidden="true">
          {Array.from({ length: lineCount }, (_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        <pre spellCheck={false}>
          <NodeViewContent<'code'> as="code" className={`hljs language-${language}`} />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
