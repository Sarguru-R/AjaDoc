"""Document content is stored as HTML restricted to what the editor can produce.

Every write (editor saves and file imports) goes through `sanitize_content`, so stored content is safe
to render no matter which client produced it.
"""

import html
import io
import re
from pathlib import PurePath

import mammoth
import markdown
import nh3

from common import ApiError

IMPORT_EXTENSIONS = (".txt", ".md", ".docx")
MAX_IMPORT_BYTES = 2 * 1024 * 1024
MAX_TITLE_LENGTH = 200
MAX_CONTENT_CHARS = 1_000_000

ALLOWED_TAGS = {
    "p", "br", "h1", "h2", "h3", "strong", "b", "em", "i", "u", "s",
    "ul", "ol", "li", "blockquote", "code", "pre", "hr", "a",
}

# Languages offered by the code block's language picker (highlight.js names).
CODE_LANGUAGES = {
    "plaintext", "python", "javascript", "typescript", "java", "c", "cpp", "csharp", "go", "rust", "sql",
    "bash", "json", "xml", "css", "yaml", "markdown", "php", "ruby", "kotlin", "swift",
}
BULLET_STYLES = {"disc", "circle", "square", "arrow", "dash", "check"}
NUMBER_STYLES = {"decimal", "decimal-leading-zero", "lower-alpha", "upper-alpha", "lower-roman", "upper-roman"}

# Attributes the editor produces, each with the exact values it may take.
_ALLOWED_VALUES = {
    ("ul", "data-list-style"): BULLET_STYLES,
    ("ol", "data-list-style"): NUMBER_STYLES,
    ("ul", "data-type"): {"taskList"},
    ("li", "data-type"): {"taskItem"},
    ("li", "data-checked"): {"true", "false"},
    ("hr", "data-type"): {"page-break"},
}


def _attribute_filter(tag: str, attribute: str, value: str) -> str | None:
    if attribute == "href" or (tag == "code" and attribute == "class"):
        return value  # href is checked by url_schemes; classes by allowed_classes
    if tag == "ol" and attribute == "start":
        return value if value.isdigit() and len(value) < 6 else None
    allowed = _ALLOWED_VALUES.get((tag, attribute))
    return value if allowed and value in allowed else None


def sanitize_content(raw_html: str) -> str:
    # Checklist checkboxes and wrappers (label/input/div) are dropped; the checked state lives on the
    # <li data-checked> attribute, which is all the editor needs to rebuild them.
    return nh3.clean(
        raw_html,
        tags=ALLOWED_TAGS,
        attributes={
            "a": {"href"},
            "ul": {"data-list-style", "data-type"},
            "ol": {"data-list-style", "start"},
            "li": {"data-type", "data-checked"},
            "hr": {"data-type"},
        },
        attribute_filter=_attribute_filter,
        allowed_classes={"code": {f"language-{lang}" for lang in CODE_LANGUAGES}},
        url_schemes={"http", "https", "mailto"},
        link_rel=None,
    )


def _text_to_html(text: str) -> str:
    """Blank lines separate paragraphs; single newlines become line breaks."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = [block.strip() for block in re.split(r"\n{2,}", text)]
    return "".join(f"<p>{html.escape(block, quote=False).replace(chr(10), '<br>')}</p>" for block in blocks if block)


def import_file(filename: str, data: bytes) -> tuple[str, str]:
    """Converts an uploaded .txt / .md / .docx file into (title, sanitized HTML)."""
    path = PurePath(filename or "")
    ext = path.suffix.lower()

    if ext == ".txt":
        body = _text_to_html(data.decode("utf-8-sig", errors="replace"))
    elif ext == ".md":
        body = markdown.markdown(data.decode("utf-8-sig", errors="replace"), extensions=["extra", "sane_lists"])
    elif ext == ".docx":
        try:
            body = mammoth.convert_to_html(io.BytesIO(data)).value
        except Exception:
            raise ApiError(422, "unreadable_file", "That .docx file could not be read. It may be corrupted.")
    else:
        raise ApiError(415, "unsupported_file_type", f"Unsupported file type. Supported types: {', '.join(IMPORT_EXTENSIONS)}.")

    title = path.stem.strip()[:MAX_TITLE_LENGTH] or "Imported document"
    return title, sanitize_content(body)
