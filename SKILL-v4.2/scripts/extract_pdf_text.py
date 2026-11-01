#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path


# Minimal English stopwords for title-overlap verification. Kept tiny so the
# check stays robust without a heavy NLP dependency.
_STOPWORDS = {
    "a", "an", "the", "and", "or", "of", "in", "on", "for", "to", "with",
    "is", "are", "by", "as", "at", "from", "that", "this", "their", "its",
    "be", "was", "were", "it", "an", "de", "la", "le", "et", "und", "der",
    "die", "von", "zu", "den",
}


def configure_utf8_stdio():
    """Keep Chinese paths/text printable in terminals."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def normalize(text):
    """Lowercase, drop non-alphanumeric (keep digits), collapse whitespace.
    CJK chars are preserved as individual tokens by the regex split below."""
    if not text:
        return ""
    low = text.lower()
    # Keep letters (incl. CJK), digits, and the DOI slash/colon context by
    # mapping everything else to spaces, then collapsing.
    low = re.sub(r"[^\w\u4e00-\u9fff]", " ", low, flags=re.UNICODE)
    return re.sub(r"\s+", " ", low).strip()


def title_tokens(title, min_len=2):
    """Content tokens of a title: lowercase, stopwords + very short tokens removed."""
    norm = normalize(title)
    out = []
    for tok in norm.split():
        if len(tok) < min_len:
            continue
        if tok in _STOPWORDS:
            continue
        out.append(tok)
    # Also keep CJK bigrams for Chinese titles (single CJK chars are noisy).
    cjk = re.findall(r"[\u4e00-\u9fff]+", normalize(title))
    for run in cjk:
        for i in range(len(run) - 1):
            out.append(run[i : i + 2])
    return out


def verify_text(text, doi=None, title=None, title_threshold=0.6):
    """Strict verification (row 10). Match iff:
      - the DOI appears in the text (normalized substring), OR
      - the title's content tokens overlap the text by >= title_threshold.
    Replaces the old loose 'text includes title (substring)' heuristic, which
    could pass on a wrong-article PDF sharing a common word."""
    norm_text = normalize(text)
    result = {"matched": False, "reason": "", "doi_match": False, "title_overlap": None}

    if doi:
        doi_norm = normalize(doi).replace(" ", "")  # collapse "10.1016 / jvb" -> "10.1016/jvb"
        norm_text_compact = norm_text.replace(" ", "")
        if doi_norm and doi_norm in norm_text_compact:
            result["doi_match"] = True
            result["matched"] = True
            result["reason"] = f"DOI '{doi}' found in text"
            return result

    if title:
        toks = title_tokens(title)
        if toks:
            present = sum(1 for t in toks if t in norm_text.split() or t in norm_text)
            overlap = present / len(toks)
            result["title_overlap"] = round(overlap, 3)
            if overlap >= title_threshold:
                result["matched"] = True
                result["reason"] = f"title overlap {overlap:.0%} >= {title_threshold:.0%}"
                return result
        result["reason"] = result["reason"] or "title overlap below threshold"

    if not doi and not title:
        result["reason"] = "no DOI or title provided for verification"
    elif not result["matched"]:
        result["reason"] = result["reason"] or "no DOI match and title overlap below threshold"
    return result


def extract_with_pdfplumber(pdf_path, max_pages):
    import pdfplumber

    chunks = []
    with pdfplumber.open(str(pdf_path)) as pdf:
        page_count = len(pdf.pages)
        pages = pdf.pages if max_pages is None else pdf.pages[:max_pages]
        for i, page in enumerate(pages, start=1):
            chunks.append(f"\n\n===== PAGE {i} =====\n")
            chunks.append(page.extract_text() or "")
    return page_count, "".join(chunks)


def extract_with_pypdf(pdf_path, max_pages):
    from pypdf import PdfReader

    reader = PdfReader(str(pdf_path))
    page_count = len(reader.pages)
    pages = reader.pages if max_pages is None else reader.pages[:max_pages]
    chunks = []
    for i, page in enumerate(pages, start=1):
        chunks.append(f"\n\n===== PAGE {i} =====\n")
        chunks.append(page.extract_text() or "")
    return page_count, "".join(chunks)


def main():
    configure_utf8_stdio()

    parser = argparse.ArgumentParser(description="Extract text from a downloaded PDF for verification or reading.")
    parser.add_argument("--pdf", required=True, help="Path to PDF")
    parser.add_argument("--out", help="Optional output .txt path")
    parser.add_argument("--pages", type=int, default=3, help="Number of pages to extract; use 0 for all pages")
    parser.add_argument("--json", action="store_true", help="Print JSON metadata instead of text preview")
    parser.add_argument("--verify", action="store_true", help="Run strict verification (requires --doi and/or --title)")
    parser.add_argument("--doi", help="DOI to look for in the text (verification)")
    parser.add_argument("--title", help="Article title to match against the text (verification)")
    parser.add_argument("--title-threshold", type=float, default=0.6, help="Min title-token overlap to count as a match")
    args = parser.parse_args()

    if args.verify and not (args.doi or args.title):
        parser.error("--verify requires --doi and/or --title")

    pdf_path = Path(args.pdf)
    max_pages = None if args.pages == 0 else args.pages

    try:
        page_count, text = extract_with_pdfplumber(pdf_path, max_pages)
        engine = "pdfplumber"
    except Exception:
        page_count, text = extract_with_pypdf(pdf_path, max_pages)
        engine = "pypdf"

    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, encoding="utf-8")

    # Basic integrity checks that always run.
    head = pdf_path.read_bytes()[:8] if pdf_path.exists() else b""
    integrity = {
        "is_pdf": head[:4] == b"%PDF",
        "pages_total": page_count,
        "pages_total_nonzero": page_count > 0,
        "chars_extracted": len(text),
        "chars_extracted_nonzero": len(text.strip()) > 0,
    }

    meta = {
        "pdf": str(pdf_path.resolve()),
        "pages_total": page_count,
        "pages_extracted": page_count if max_pages is None else min(max_pages, page_count),
        "chars": len(text),
        "engine": engine,
        "out": str(Path(args.out).resolve()) if args.out else None,
        "integrity": integrity,
    }

    if args.verify:
        meta["verification"] = verify_text(text, doi=args.doi, title=args.title, title_threshold=args.title_threshold)

    if args.json or args.verify:
        print(json.dumps(meta, ensure_ascii=False, indent=2))
    else:
        print(json.dumps(meta, ensure_ascii=False))
        print(text[:4000])


if __name__ == "__main__":
    main()