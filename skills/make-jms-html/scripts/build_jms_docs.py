#!/usr/bin/env python3
"""Build every JMS Markdown document into a house-styled HTML page.

Reads `docs.toml` from the project root (next to the Markdown files). Each
section names one source file and the shell text for its page:

    [defaults]
    chapter_regex = '^(\\d+)\\.'
    theme = "skills/make-jms-html/assets/jms_theme.toml"

    [docs."_PLAN.md"]
    title    = "JMS · Product Plan"
    eyebrow  = "Acme Windows · Job Management System"
    subtitle = "What we are building, for whom, and how we will know it is done."
    footer   = 'Plan v0.0.1 · <a href="_TECH.md">next: _TECH.md</a>'

Missing keys fall back to the first `# h1` of the source (title) and to
`[defaults]`. A source with no entry is still built, using the h1.

    python scripts/build_jms_docs.py                     # all docs
    python scripts/build_jms_docs.py --only _PLAN.md     # one document
    python scripts/build_jms_docs.py --root .            # explicit root

Documentation is HTML-only by design. Markdown is converted to a single-file
HTML page; there is no PDF build step.

Dependency: `markdown` (Python-Markdown). Python 3.11+ for tomllib.
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
import tomllib

HERE = pathlib.Path(__file__).resolve().parent
SKILL = HERE.parent
BUILD = HERE / "build_jms_html.py"
THEME = SKILL / "assets" / "jms_theme.toml"

# Repo-local PDF helper (the skill lives next to this one in the JMS repo).
PDF_SCRIPT = SKILL.parent / "make-pdf-from-html" / "scripts" / "make_pdf.py"

DEFAULT_CHAPTER_REGEX = r"^(\d+)\."


def load_config(root: pathlib.Path) -> dict:
    path = root / "docs.toml"
    if not path.exists():
        return {}
    with path.open("rb") as fh:
        return tomllib.load(fh)


def build_one(root: pathlib.Path, src: pathlib.Path, meta: dict, theme: pathlib.Path) -> pathlib.Path:
    out = src.with_suffix(".html")
    cmd = [
        sys.executable, str(BUILD),
        "--src", str(src),
        "--out", str(out),
        "--theme", str(theme),
        "--chapter-regex", meta.get("chapter_regex", DEFAULT_CHAPTER_REGEX),
    ]
    for key in ("title", "eyebrow", "subtitle", "footer", "mode", "webfont"):
        value = meta.get(key)
        if value is not None:
            cmd += [f"--{key}", str(value)]
    for skip in meta.get("skip_heading", []) or []:
        cmd += ["--skip-heading", str(skip)]

    print(f"\n>>> {src.name} -> {out.name}")
    subprocess.run(cmd, check=True, cwd=root)
    return out


def build_pdf(html: pathlib.Path) -> None:
    if not PDF_SCRIPT.exists():
        print(f"    PDF skipped: {PDF_SCRIPT} not found")
        return
    pdf = html.with_suffix(".pdf")
    print(f"    PDF -> {pdf.name}")
    result = subprocess.run([sys.executable, str(PDF_SCRIPT), str(html), str(pdf)])
    if result.returncode != 0:
        print("    PDF failed (HTML is still built)")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Build JMS Markdown docs into house-styled HTML.")
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."),
                        help="project root holding the Markdown files and docs.toml (default: .)")
    parser.add_argument("--theme", type=pathlib.Path, help="theme TOML (default: skill jms_theme.toml)")
    parser.add_argument("--only", action="append", default=[],
                        help="build only this file name, repeatable (e.g. --only _PLAN.md)")
    parser.add_argument("--pdf", dest="pdf", action="store_true", help="also build a PDF (default)")
    parser.add_argument("--no-pdf", dest="pdf", action="store_false", help="HTML only")
    parser.set_defaults(pdf=True)
    args = parser.parse_args(argv)

    root = args.root.resolve()
    config = load_config(root)
    defaults = config.get("defaults", {})
    docs = config.get("docs", {})

    theme = args.theme or (root / defaults["theme"] if "theme" in defaults else THEME)
    theme = pathlib.Path(theme)
    if not theme.exists():
        print(f"error: theme not found: {theme}", file=sys.stderr)
        return 2

    # An explicit [docs] table is the allowlist; without one, build every _*.md.
    if docs:
        sources = [root / name for name in docs]
    else:
        sources = sorted(root.glob("_*.md"))
    if args.only:
        wanted = set(args.only)
        sources = [p for p in sources if p.name in wanted]
        missing = wanted - {p.name for p in sources}
        if missing:
            print(f"error: not selected in docs.toml (or missing): {', '.join(sorted(missing))}",
                  file=sys.stderr)
            return 2
    absent = [p.name for p in sources if not p.is_file()]
    if absent:
        print(f"error: listed in docs.toml but not found: {', '.join(absent)}", file=sys.stderr)
        return 2
    sources = [p for p in sources if p.is_file()]
    if not sources:
        print(f"error: no documents to build in {root}", file=sys.stderr)
        return 2

    built: list[pathlib.Path] = []
    for src in sources:
        meta = {**defaults, **docs.get(src.name, {})}
        built.append(build_one(root, src, meta, theme))

    if args.pdf:
        for html in built:
            build_pdf(html)

    print("\nbuilt:")
    for html in built:
        extra = " + pdf" if args.pdf and html.with_suffix(".pdf").exists() else ""
        size = f"{html.stat().st_size / 1024:.0f} KB"
        print(f"  {html.name:<16} {size:>8}{extra}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
