# skills/

Portable skill bundles kept in this repo so they can be exported and dropped
into any Hermes install.

## make-jms-html

Builds the JMS documentation pages (`_PLAN.html`, later `_TECH.html`) in the same
house style, with the JMS type defaults baked in: **25px page text** and
**20.4px sidebar/chrome** (20% larger than the make-book 17px UI base).

```
make-jms-html/
  SKILL.md                       when to use it, JMS defaults, conventions, checks
  scripts/build_jms_html.py      Markdown -> one house-styled HTML page (vendored
                                 from make-book with the JMS type/theme defaults)
  scripts/build_jms_docs.py      every doc listed in docs.toml -> HTML (+ PDF)
  assets/jms_theme.toml          JMS theme: type bases + house colours
  assets/docs.toml.example       per-document titles, eyebrow, subtitle, footer
  references/theme-keys.md       every key, CSS variable and panel range
```

At the repo root, `docs.toml` and `jms_theme.toml` are the project copies the
batch builder reads:

```bash
python skills/make-jms-html/scripts/build_jms_docs.py --pdf
python skills/make-jms-html/scripts/build_jms_docs.py --no-pdf --only _PLAN.md
```

## make-book

Turns a Markdown document into the same kind of single-file, two-pane guide as
this repo's `book.html` — sticky contents pane with filter and scroll-spy,
terracotta/serif house style, and the live **Aa** appearance panel (type,
layout, fonts, light/dark colours, Copy TOML).

```
make-book/
  SKILL.md                  when to use it, workflow, panel internals, pitfalls
  scripts/build_book.py     Markdown -> single-file HTML (CSS + JS inlined)
  assets/book_theme.toml    default theme: colours, fonts, sizes, layout
  references/theme-keys.md  every key, CSS variable and panel range
```

### Install

Copy the folder into a Hermes skills directory:

```bash
# this profile
cp -r skills/make-book ~/AppData/Local/hermes/skills/software-development/

# any other profile
cp -r skills/make-book <hermes-home>/profiles/<name>/skills/software-development/
```

Hermes picks it up on the next session (`skills_list` / `skill_view(make-book)`).

### Use without installing

The generator is standalone — Python 3.11+, `markdown` as the only dependency:

```bash
cd skills/make-book
uv run --with markdown python scripts/build_book.py --help

# rebuild this repo's book through the skill instead of build_book.py
cd ../..
uv run --with markdown python skills/make-book/scripts/build_book.py \
    --src EXPLAINER.md --out /tmp/book-skills.html --theme book_theme.toml \
    --title "Nanocode, explained" \
    --eyebrow "Build your own coding agent" \
    --subtitle "A chapter-by-chapter walkthrough for students."
```

`--theme` defaults to `book_theme.toml` in the working directory; start from
`assets/book_theme.toml` and edit, or open the built page and use **Copy TOML**.

### Export as an archive

```bash
cd skills && tar -czf make-book.tgz make-book     # or: zip -r make-book.zip make-book
```
