---
name: make-jms-html
description: Build JMS Markdown documents (_PLAN.md, _TECH.md, help pages) into the house-styled single-file HTML guide with the JMS type defaults (25px page text, TOC/chrome 20% larger) and the Aa appearance panel. Use when rendering or restyling JMS documentation pages.
version: 1.0.0
author: JMS project
license: MIT
metadata:
  tags: [docs, html, markdown, css, theming, jms]
  related_skills: [make-book, make-html-from-md, anthropic-html-style]
---

# make-jms-html

Turns a long JMS Markdown document into the same page shape our published guides
use (the mini-js-coder site and book):

- **one self-contained HTML file** — CSS and JS inlined, opens from `file://`,
  no server, no CDN needed;
- **two-pane layout** — sticky contents pane with a filter box and scroll-spy,
  reading column on the right, previous/next chapter strip;
- **warm house style** — paper/ivory surfaces, terracotta accent, serif headings,
  dark code blocks, print-friendly;
- **floating Aa panel** — System/Light/Dark, type sizes, line heights, layout
  width, curated font dropdowns, every colour token, Reset and Copy theme;
- **JMS type defaults** — reading text **25px**, sidebar and all chrome
  **20.4px** (20% larger than the upstream 17px UI base);
- **print styles** — navigation and the Aa panel hide when printing.

This skill is self-contained. It vendors the make-book generator with only the
three documented differences listed in `scripts/build_jms_html.py`, so it can be
dropped into any project without the make-book skill present.

## Layout

```
make-jms-html/
  SKILL.md                    this file: workflow, conventions, checks, pitfalls
  assets/jms_theme.toml        the JMS theme (type defaults + house colours)
  scripts/build_jms_html.py    one Markdown -> one HTML page
  scripts/build_jms_docs.py    every _*.md in a project -> HTML
  references/theme-keys.md     every theme key, CSS variable and panel range
```

## Quickstart

### One document

```bash
cd <project-root>
python <skill>/scripts/build_jms_html.py \
    --src _PLAN.md --out _PLAN.html \
    --title "JMS · Product Plan" \
    --eyebrow "Acme Windows · Job Management System" \
    --subtitle "What we are building, for whom, and how we will know it is done." \
    --footer 'Plan v0.0.1 · <a href="_TECH.md">next: _TECH.md</a>' \
    --chapter-regex '^(\d+)\.'
```

The theme defaults to `assets/jms_theme.toml` in this skill, so `--theme` is only
needed when a document wants a different look. `markdown` (Python-Markdown) is
the only dependency; Python 3.11+ for `tomllib`.

### A whole docs set (preferred)

Put a `docs.toml` in the project root (see `assets/docs.toml.example`), then:

```bash
python <skill>/scripts/build_jms_docs.py            # all _*.md -> HTML
python <skill>/scripts/build_jms_docs.py --only _PLAN.md

Documentation is HTML-only: Markdown is converted to a single-file page and
never to PDF.
```

`docs.toml` carries the per-document shell text so the command line stays short
and the titles cannot drift between rebuilds.

## JMS type defaults (do not silently change)

| What | Key | Value | Effect |
|---|---|---|---|
| Page text | `fs_content` | **25px** | paragraphs, lists, tables, callouts |
| Page line height | `lh_content` | 1.62 | |
| TOC + chrome | `fs_ui` | **20.4px** | sidebar entries, filter, eyebrow, footer, panel labels |
| Chrome line height | `lh_ui` | 1.62 | |

`20.4` is exactly `17 × 1.2` — the sidebar is 20% larger than the upstream
make-book base while the page text is 25px. Every other size is a multiplier of
those two bases (`[type.scale]` in the theme), so changing one base rescales a
whole family consistently. Both values are inside the Aa panel ranges, so a
reader can still adjust them at runtime; the theme file is only the default.

If a request says "bigger text", change `fs_content`; if it says "bigger
sidebar/contents", change `fs_ui`. Do not scale individual sizes by hand.

## Writing Markdown for these pages

| Markdown | Rendered as |
|---|---|
| `# Title` | page `<h1>` (also the sidebar title fallback) |
| `## 1. Section` | numbered chapter (`--chapter-regex '^(\d+)\.'` gives the `01` pill) and a TOC entry |
| `### 1.1 Sub` | section link nested under its chapter |
| `#### Sub-sub` | in-page heading, not in the TOC |
| `> **Label.** text` | callout; `> - item` inside a callout becomes a real list |
| ```` ```lang ```` | dark code block with a caption and Copy button |
| `\| a \| b \|` | table; scrolls inside its own wrapper on narrow screens |
| `---` | horizontal rule |
| `- ☐ item` | checklist row (Markdown `- [ ]` is **not** converted — use `☐`) |

House rules for JMS documents:

1. Number the `##` headings (`1.`, `2.`, …) and the `###` headings (`1.1`) so the
   sidebar reads like a contract and deep links stay stable.
2. One idea per section; a table beats three paragraphs of prose.
3. Never put code in `_PLAN.md` (the idea brief forbids it); `_TECH.md` may use
   fenced blocks freely.
4. Keep the closing "scope reminder" callout and any acceptance checklist.
5. References to sibling documents are plain links (`_TECH.md`), so they work in
   Markdown and in the rendered page.

## Theme and appearance

- `assets/jms_theme.toml` is the source of truth for colours, fonts and the type
  bases. `references/theme-keys.md` documents every key, its CSS variable and
  its panel range.
- The Aa panel writes the same keys at runtime and **Copy TOML** exports them, so
  a look designed in the browser can be pasted straight back into the theme file.
- Resolution order for a page: theme file → built-in defaults (identical values)
  → the reader's saved panel state in `localStorage`.
- Keep the house palette. Page-specific colour overrides belong in the theme,
  not in a second stylesheet. The app's own UI tokens come from
  `skills/anthropic-html-style/references/anthropic-ui.css`; the guide pages use
  the theme file. They share the same values on purpose.
- `mode = "auto"` follows the OS. `--mode light|dark` bakes a fixed scheme into
  the build (useful for screenshots and printed handouts).

## Verification checklist

After any build:

- [ ] The page opens from `file://` with no console errors and no server.
- [ ] Sidebar lists every `##` chapter with its `###` sections; filter narrows it.
- [ ] Scrolling highlights the active chapter and section.
- [ ] Page text is 25px and sidebar/chrome is 20.4px at default zoom
      (`getComputedStyle(document.documentElement).getPropertyValue('--fs-content')`).
- [ ] The Aa button opens the panel; System/Light/Dark repaint sidebar **and**
      content; Escape and X close it; settings survive a reload.
- [ ] Tables scroll horizontally inside their wrapper; code blocks keep their
      Copy button; checklists show `☐`.
- [ ] Print preview hides the sidebar, progress bar and Aa panel; chapters start
      on a new page.
- [ ] If a source `.md` changed, the HTML was rebuilt — never hand-edit generated
      HTML.

## Pitfalls

- **Do not hand-edit the generated HTML.** Fix the Markdown or the theme and
  rebuild; the build is idempotent.
- **Rebuild after every Markdown edit**; the HTML is the deliverable, so never
  hand-edit it.
- **Chapter numbering comes from the heading text**, not the order: `## 3. …`
  with regex `^(\d+)\.` yields pill `03`. A heading without a number becomes a
  plain front-matter entry — that is the intended way to add "Glossary" or
  "Appendix" style sections.
- **`- [ ]` is not a checkbox** in this renderer. Use `☐`.
- **Long unnumbered `##` headings** wrap in the sidebar; keep chapter titles
  under ~60 characters where possible.
- **Do not fork the generator.** `scripts/build_jms_html.py` is vendored from
  make-book 1.0.0. Fix rendering bugs upstream first, then re-copy and re-apply
  the three documented deltas (theme path, two type defaults, docstring).
- **Google Fonts is the only network reference.** Set `webfont_url = ""` in the
  theme for a fully offline artefact.
- **Theme values must stay inside the panel ranges** (`fs_ui` 10–30,
  `fs_content` 16–90, line heights 1.0–2.6) or the Aa sliders clamp and the panel
  stops agreeing with the file.

## Installing / exporting

```bash
# use it from another profile
cp -r skills/make-jms-html ~/AppData/Local/hermes/skills/software-development/

# ship it
cd skills && tar -czf make-jms-html.tgz make-jms-html
```

The skill has no absolute paths: the generator resolves its theme relative to
itself, and the batch builder takes `--root`.
