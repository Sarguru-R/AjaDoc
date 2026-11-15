"""Converts stored document HTML into downloadable files: Word (.docx), Markdown, HTML and plain text.

Stored content is sanitized HTML restricted to the editor's tags (see content.py), so a small parser
that understands exactly those tags is enough:
  blocks:  p, h1-h3, ul/ol/li, blockquote, pre, hr
  inline:  strong/b, em/i, u, s, code, a, br
"""

import html as html_lib
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import quote

from docx import Document as WordDocument
from docx.enum.text import WD_COLOR_INDEX
from docx.opc.constants import RELATIONSHIP_TYPE
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.enum.section import WD_ORIENT
from docx.shared import Mm, Pt, RGBColor

from common import ApiError

FORMATS = {
    "docx": ("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"),
    "md": ("text/markdown; charset=utf-8", "md"),
    "html": ("text/html; charset=utf-8", "html"),
    "txt": ("text/plain; charset=utf-8", "txt"),
}

BLOCK_TAGS = {"p", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "pre", "hr"}
MARK_TAGS = {"strong": "bold", "b": "bold", "em": "italic", "i": "italic", "u": "underline", "s": "strike", "code": "code"}


# --- parsing ----------------------------------------------------------------------------------


@dataclass
class Node:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)  # Node | str


class _TreeBuilder(HTMLParser):
    VOID = {"br", "hr"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root")
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in self.VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse(content: str) -> Node:
    builder = _TreeBuilder()
    builder.feed(content or "")
    builder.close()
    return builder.root


@dataclass
class Span:
    """A run of text with formatting. `text == "\\n"` with `br=True` is a hard line break."""

    text: str
    marks: frozenset = frozenset()
    href: str | None = None
    br: bool = False


def inline_spans(node: Node, marks: frozenset = frozenset(), href: str | None = None) -> list[Span]:
    spans: list[Span] = []
    for child in node.children:
        if isinstance(child, str):
            if child:
                spans.append(Span(child, marks, href))
        elif child.tag == "br":
            spans.append(Span("\n", marks, href, br=True))
        elif child.tag in BLOCK_TAGS:
            continue  # nested blocks (e.g. a list inside a list item) are rendered separately
        else:
            child_marks = marks | {MARK_TAGS[child.tag]} if child.tag in MARK_TAGS else marks
            child_href = child.attrs.get("href") or href if child.tag == "a" else href
            spans.extend(inline_spans(child, child_marks, child_href))
    return spans


def _normalise(spans: list[Span]) -> list[Span]:
    """Collapse HTML whitespace the way a browser would."""
    out = []
    for span in spans:
        text = span.text if span.br else re.sub(r"\s+", " ", span.text)
        out.append(Span(text, span.marks, span.href, span.br))
    if out and not out[0].br:
        out[0] = Span(out[0].text.lstrip(), out[0].marks, out[0].href)
    if out and not out[-1].br:
        out[-1] = Span(out[-1].text.rstrip(), out[-1].marks, out[-1].href)
    return [s for s in out if s.text]


def _block_children(node: Node) -> list[Node]:
    """Block-level children; stray inline content directly inside a container is wrapped in a paragraph."""
    blocks, loose = [], Node("p")
    for child in node.children:
        if isinstance(child, Node) and child.tag in BLOCK_TAGS:
            if loose.children:
                blocks.append(loose)
                loose = Node("p")
            blocks.append(child)
        elif isinstance(child, str) and not child.strip() and not loose.children:
            continue
        else:
            loose.children.append(child)
    if loose.children and any(not isinstance(c, str) or c.strip() for c in loose.children):
        blocks.append(loose)
    return blocks


def _plain(node: Node) -> str:
    return "".join(s.text for s in _normalise(inline_spans(node)))


def _raw_text(node: Node) -> str:
    """Text with whitespace preserved, for code blocks."""
    return "".join(c if isinstance(c, str) else _raw_text(c) for c in node.children)


# --- list markers, code language, page breaks -------------------------------------------------

_BULLETS = {"disc": "•", "circle": "◦", "square": "▪", "arrow": "➤", "dash": "–", "check": "✓"}


def _roman(n: int) -> str:
    out = ""
    for value, numeral in ((1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
                           (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i")):
        while n >= value:
            out, n = out + numeral, n - value
    return out


def _alpha(n: int) -> str:
    out = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = chr(97 + rem) + out
    return out


def _number_label(style: str | None, n: int) -> str:
    if style == "lower-alpha":
        return _alpha(n)
    if style == "upper-alpha":
        return _alpha(n).upper()
    if style == "lower-roman":
        return _roman(n)
    if style == "upper-roman":
        return _roman(n).upper()
    if style == "decimal-leading-zero":
        return f"{n:02d}"
    return str(n)


def _start(block: Node) -> int:
    value = block.attrs.get("start") or "1"
    return int(value) if value.isdigit() else 1


def _is_task_list(block: Node) -> bool:
    return block.tag == "ul" and block.attrs.get("data-type") == "taskList"


def _checked(item: Node) -> bool:
    return item.attrs.get("data-checked") == "true"


def _code_language(block: Node) -> str:
    for child in block.children:
        if isinstance(child, Node) and child.tag == "code":
            for cls in (child.attrs.get("class") or "").split():
                if cls.startswith("language-") and cls != "language-plaintext":
                    return cls.removeprefix("language-")
    return ""


def _is_page_break(block: Node) -> bool:
    return block.tag == "hr" and block.attrs.get("data-type") == "page-break"


# --- Markdown ---------------------------------------------------------------------------------


def _md_escape(text: str) -> str:
    return re.sub(r"([\\`*_\[\]])", r"\\\1", text)


def _md_inline(spans: list[Span]) -> str:
    out = []
    for span in _normalise(spans):
        if span.br:
            out.append("  \n")
            continue
        text = span.text if "code" in span.marks else _md_escape(span.text)
        if "code" in span.marks:
            text = f"`{text}`"
        if "bold" in span.marks:
            text = f"**{text}**"
        if "italic" in span.marks:
            text = f"*{text}*"
        if "strike" in span.marks:
            text = f"~~{text}~~"
        if "underline" in span.marks:
            text = f"<u>{text}</u>"  # Markdown has no underline; inline HTML is widely supported
        if span.href:
            text = f"[{text}]({span.href})"
        out.append(text)
    return "".join(out)


def _md_blocks(node: Node, indent: str = "") -> list[str]:
    lines: list[str] = []
    for block in _block_children(node):
        tag = block.tag
        if tag in ("h1", "h2", "h3"):
            lines.append(f"{indent}{'#' * int(tag[1])} {_md_inline(inline_spans(block))}")
        elif tag == "p":
            text = _md_inline(inline_spans(block))
            if text:
                lines.append(indent + text.replace("\n", "\n" + indent))
        elif tag in ("ul", "ol"):
            items = [c for c in block.children if isinstance(c, Node) and c.tag == "li"]
            rendered = []
            for number, item in enumerate(items, start=_start(block)):
                if _is_task_list(block):
                    marker = "- [x] " if _checked(item) else "- [ ] "
                else:
                    marker = f"{number}. " if tag == "ol" else "- "
                inner = _md_blocks(item, indent + " " * len(marker))
                first = inner[0][len(indent) + len(marker):] if inner else ""
                rendered.append(f"{indent}{marker}{first}")
                rendered.extend(inner[1:])
            lines.append("\n".join(rendered))
        elif tag == "blockquote":
            inner = "\n\n".join(_md_blocks(block))
            lines.append("\n".join(f"{indent}> {line}".rstrip() for line in inner.split("\n")))
        elif tag == "pre":
            code = _raw_text(block).strip("\n")
            lines.append(f"{indent}```{_code_language(block)}\n{code}\n{indent}```")
        elif _is_page_break(block):
            lines.append(f'{indent}<div style="page-break-after: always"></div>')
        elif tag == "hr":
            lines.append(f"{indent}---")
    return lines


def to_markdown(content: str) -> str:
    return "\n\n".join(_md_blocks(parse(content))).strip() + "\n"


# --- Plain text -------------------------------------------------------------------------------


def _txt_blocks(node: Node, indent: str = "") -> list[str]:
    lines: list[str] = []
    for block in _block_children(node):
        tag = block.tag
        if tag in ("h1", "h2", "h3", "p"):
            text = _plain(block)
            if text:
                lines.append(indent + text.replace("\n", "\n" + indent))
        elif tag in ("ul", "ol"):
            items = [c for c in block.children if isinstance(c, Node) and c.tag == "li"]
            rendered = []
            for number, item in enumerate(items, start=_start(block)):
                if _is_task_list(block):
                    marker = "[x] " if _checked(item) else "[ ] "
                elif tag == "ol":
                    marker = f"{_number_label(block.attrs.get('data-list-style'), number)}. "
                else:
                    marker = f"{_BULLETS.get(block.attrs.get('data-list-style') or 'disc', '•')} "
                inner = _txt_blocks(item, indent + " " * len(marker))
                first = inner[0][len(indent) + len(marker):] if inner else ""
                rendered.append(f"{indent}{marker}{first}")
                rendered.extend(inner[1:])
            lines.append("\n".join(rendered))
        elif tag == "blockquote":
            inner = "\n\n".join(_txt_blocks(block))
            lines.append("\n".join(f"{indent}  | {line}".rstrip() for line in inner.split("\n")))
        elif tag == "pre":
            lines.append(_raw_text(block).strip("\n"))
        elif _is_page_break(block):
            lines.append("\f")  # form feed: starts a new page when printed
        elif tag == "hr":
            lines.append(indent + "-" * 40)
    return lines


def to_text(content: str) -> str:
    return "\n\n".join(_txt_blocks(parse(content))).strip() + "\n"


# --- HTML -------------------------------------------------------------------------------------


def to_html(title: str, content: str, page_setup: dict | None = None) -> str:
    safe_title = html_lib.escape(title)
    width, height, m = _page_dimensions(page_setup)
    page_rule = f"@page {{ size: {width}mm {height}mm; margin: {m['top']}mm {m['right']}mm {m['bottom']}mm {m['left']}mm; }}"
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{safe_title}</title>
<style>
  {page_rule}
  body {{ max-width: 760px; margin: 48px auto; padding: 0 20px; font: 16px/1.7 Poppins, -apple-system, "Segoe UI", sans-serif; color: #1b1c1c; }}
  h1, h2, h3 {{ color: #001d6b; line-height: 1.25; }}
  blockquote {{ margin: 1em 0; padding: 0.2em 1em; border-left: 3px solid #97c2f8; background: #eef5ff; color: #272d3b; }}
  pre {{ background: #001d6b; color: #f5f8ff; padding: 14px; overflow-x: auto; }}
  code {{ background: #eef5ff; padding: 1px 5px; }}
  pre code {{ background: none; padding: 0; }}
  a {{ color: #001d6b; }}
</style>
</head>
<body>
{content}
</body>
</html>
"""


# --- Word (.docx) -----------------------------------------------------------------------------


def _add_hyperlink(paragraph, url: str, text: str, marks: frozenset) -> None:
    """python-docx has no hyperlink API; build the w:hyperlink element directly."""
    rel_id = paragraph.part.relate_to(url, RELATIONSHIP_TYPE.HYPERLINK, is_external=True)
    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), rel_id)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "1F4FB8")
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(color)
    props.append(underline)
    for mark, tag in (("bold", "w:b"), ("italic", "w:i"), ("strike", "w:strike")):
        if mark in marks:
            props.append(OxmlElement(tag))
    run.append(props)
    text_el = OxmlElement("w:t")
    text_el.text = text
    text_el.set(qn("xml:space"), "preserve")
    run.append(text_el)
    link.append(run)
    paragraph._p.append(link)


def _docx_runs(paragraph, spans: list[Span]) -> None:
    for span in _normalise(spans):
        if span.br:
            paragraph.add_run().add_break()
            continue
        if span.href and span.href.startswith(("http://", "https://", "mailto:")):
            _add_hyperlink(paragraph, span.href, span.text, span.marks)
            continue
        run = paragraph.add_run(span.text)
        run.bold = "bold" in span.marks or None
        run.italic = "italic" in span.marks or None
        run.underline = "underline" in span.marks or None
        run.font.strike = "strike" in span.marks or None
        if "code" in span.marks:
            run.font.name = "Consolas"
            run.font.highlight_color = WD_COLOR_INDEX.GRAY_25


def _restart_numbering(document, paragraph) -> None:
    """Make each numbered list start at 1 instead of continuing the previous list."""
    numbering = document.part.numbering_part.numbering_definitions._numbering
    style_num = paragraph.style.element.pPr.numPr.numId.val
    abstract_id = numbering.num_having_numId(style_num).abstractNumId.val
    num = numbering.add_num(abstract_id)
    override = num.add_lvlOverride(ilvl=0)
    override.add_startOverride(1)
    num_pr = paragraph._p.get_or_add_pPr().get_or_add_numPr()
    num_pr.get_or_add_numId().val = num.numId
    num_pr.get_or_add_ilvl().val = 0


def _docx_blocks(document, node: Node, depth: int = 0, quote: bool = False) -> None:
    for block in _block_children(node):
        tag = block.tag
        if tag in ("h1", "h2", "h3"):
            _docx_runs(document.add_paragraph(style=f"Heading {tag[1]}"), inline_spans(block))
        elif tag == "p":
            paragraph = document.add_paragraph(style="Quote" if quote else None)
            _docx_runs(paragraph, inline_spans(block))
        elif _is_task_list(block) or (tag == "ol" and block.attrs.get("data-list-style") not in (None, "decimal")):
            # Checklists and lettered/roman lists: written with explicit markers, which Word shows faithfully.
            for number, item in enumerate((c for c in block.children if isinstance(c, Node) and c.tag == "li"), start=_start(block)):
                item_blocks = _block_children(item)
                lead = item_blocks[0] if item_blocks and item_blocks[0].tag == "p" else None
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.left_indent = Pt(18 * (depth + 1))
                paragraph.paragraph_format.first_line_indent = Pt(-14)
                marker = ("☑ " if _checked(item) else "☐ ") if _is_task_list(block) else f"{_number_label(block.attrs.get('data-list-style'), number)}. "
                paragraph.add_run(marker)
                if lead is not None:
                    _docx_runs(paragraph, inline_spans(lead))
                _docx_blocks(document, Node("li", children=[b for b in item_blocks if b is not lead]), depth + 1, quote)
        elif tag in ("ul", "ol"):
            base = "List Number" if tag == "ol" else "List Bullet"
            style = base if depth == 0 else f"{base} {min(depth + 1, 3)}"
            first = True
            for item in (c for c in block.children if isinstance(c, Node) and c.tag == "li"):
                item_blocks = _block_children(item)
                lead = item_blocks[0] if item_blocks and item_blocks[0].tag == "p" else None
                paragraph = document.add_paragraph(style=style)
                if lead is not None:
                    _docx_runs(paragraph, inline_spans(lead))
                if tag == "ol" and first and depth == 0:
                    try:
                        _restart_numbering(document, paragraph)
                    except AttributeError:
                        pass  # template without numbering definitions: numbering simply continues
                first = False
                rest = Node("li", children=[b for b in item_blocks if b is not lead])
                _docx_blocks(document, rest, depth + 1, quote)
        elif tag == "blockquote":
            _docx_blocks(document, block, depth, quote=True)
        elif tag == "pre":
            code = _raw_text(block).strip("\n")
            paragraph = document.add_paragraph()
            shading = OxmlElement("w:shd")
            for key, value in (("w:val", "clear"), ("w:color", "auto"), ("w:fill", "F3F6FB")):
                shading.set(qn(key), value)
            paragraph._p.get_or_add_pPr().append(shading)
            run = paragraph.add_run(code)
            run.font.name = "Consolas"
            run.font.size = Pt(10)
        elif _is_page_break(block):
            document.add_page_break()
        elif tag == "hr":
            paragraph = document.add_paragraph()
            borders = OxmlElement("w:pBdr")
            bottom = OxmlElement("w:bottom")
            for key, value in (("w:val", "single"), ("w:sz", "6"), ("w:space", "1"), ("w:color", "97C2F8")):
                bottom.set(qn(key), value)
            borders.append(bottom)
            paragraph._p.get_or_add_pPr().append(borders)


PAGE_SIZES_MM = {"A4": (210.0, 297.0), "Letter": (215.9, 279.4), "Legal": (215.9, 355.6)}


def _page_dimensions(page_setup: dict | None) -> tuple[float, float, dict]:
    setup = page_setup or {}
    width, height = PAGE_SIZES_MM.get(setup.get("size", "A4"), PAGE_SIZES_MM["A4"])
    if setup.get("orientation") == "landscape":
        width, height = height, width
    margins = setup.get("margins") or {"top": 25.4, "right": 25.4, "bottom": 25.4, "left": 25.4}
    return width, height, margins


def to_docx(title: str, content: str, author: str, page_setup: dict | None = None) -> bytes:
    document = WordDocument()
    width, height, margins = _page_dimensions(page_setup)
    section = document.sections[0]
    section.orientation = WD_ORIENT.LANDSCAPE if width > height else WD_ORIENT.PORTRAIT
    section.page_width, section.page_height = Mm(width), Mm(height)
    section.top_margin, section.bottom_margin = Mm(margins["top"]), Mm(margins["bottom"])
    section.left_margin, section.right_margin = Mm(margins["left"]), Mm(margins["right"])
    styles = document.styles
    styles["Normal"].font.name = "Calibri"
    styles["Normal"].font.size = Pt(11)
    for level in (1, 2, 3):
        styles[f"Heading {level}"].font.color.rgb = RGBColor(0x00, 0x1D, 0x6B)
    document.core_properties.title = title
    document.core_properties.author = author
    document.core_properties.created = datetime.now(timezone.utc)
    _docx_blocks(document, parse(content))
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


# --- entry point ------------------------------------------------------------------------------


def safe_filename(title: str, extension: str) -> tuple[str, str]:
    """Returns (ASCII fallback, RFC 5987 UTF-8 value) for Content-Disposition."""
    cleaned = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', " ", title).strip().strip(".") or "document"
    cleaned = re.sub(r"\s+", " ", cleaned)[:120]
    ascii_name = unicodedata.normalize("NFKD", cleaned).encode("ascii", "ignore").decode() or "document"
    return f"{ascii_name}.{extension}", quote(f"{cleaned}.{extension}")


def export_document(title: str, content: str, author: str, fmt: str, page_setup: dict | None = None) -> tuple[bytes, str, str]:
    """Returns (file bytes, media type, Content-Disposition header value)."""
    if fmt not in FORMATS:
        raise ApiError(400, "unsupported_format", f"Unsupported format. Choose one of: {', '.join(FORMATS)}.")
    media_type, extension = FORMATS[fmt]
    if fmt == "docx":
        data = to_docx(title, content, author, page_setup)
    elif fmt == "md":
        data = to_markdown(content).encode("utf-8")
    elif fmt == "html":
        data = to_html(title, content, page_setup).encode("utf-8")
    else:
        data = to_text(content).encode("utf-8")
    ascii_name, utf8_name = safe_filename(title, extension)
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{utf8_name}"
    return data, media_type, disposition
