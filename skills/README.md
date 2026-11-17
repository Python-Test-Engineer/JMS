# skills/

Portable skill bundles kept in this repo so they can be exported and dropped
into any Hermes install.

## make-jms-html

Builds the JMS documentation pages (`_PLAN.html`, later `_TECH.html`) in the same
house style, with the JMS type defaults baked in: **25px page text** and
**20.4px sidebar/chrome** (20% larger than the upstream 17px UI base).

```
make-jms-html/
  SKILL.md                       when to use it, JMS defaults, conventions, checks
  scripts/build_jms_html.py      Markdown -> one house-styled HTML page (vendored
                                 generator with the JMS type/theme defaults)
  scripts/build_jms_docs.py      every doc listed in docs.toml -> HTML
  assets/jms_theme.toml          JMS theme: type bases + house colours
  assets/docs.toml.example       per-document titles, eyebrow, subtitle, footer
  references/theme-keys.md       every key, CSS variable and panel range
```

At the repo root, `docs.toml` and `jms_theme.toml` are the project copies the
batch builder reads:

```bash
python skills/make-jms-html/scripts/build_jms_docs.py
python skills/make-jms-html/scripts/build_jms_docs.py --only _PLAN.md
```

Documentation is HTML-only; the batch builder has no PDF step.

## Other skills retained

- `make-html-from-md` — general Markdown-to-guide conversion notes.
- `make-pdf-from-html` — optional PDF helper (not used by the docs build).
- `make-pdf-from-md` — optional Markdown-to-PDF helper (not used by the docs build).
