// Theme model for the app appearance and the admin "Site theme" screen.
//
// The keys and defaults follow skills/make-jms-html (references/theme-keys.md
// and assets/jms_theme.toml) so a look designed in either place can be moved
// between the documentation pages and the application. Colours are emitted as
// --theme-<key> custom properties; the app's own tokens (--bg, --text, ...) are
// aliases of those, which is what makes one palette drive every rule.

export const COLOR_KEYS = [
  ["paper", "Page background"],
  ["surface", "Subtle panels and sidebar"],
  ["ivory", "Cards and inputs"],
  ["ink", "Body text"],
  ["muted", "Secondary text"],
  ["stone", "Strong borders and faint labels"],
  ["line", "Borders"],
  ["line_soft", "Hairlines"],
  ["terra", "Accent"],
  ["terra_dark", "Links and accent text"],
  ["accent_strong", "Eyebrow and active label"],
  ["hover_bg", "Hover background"],
  ["active_bg", "Active / soft accent"],
  ["active_fg", "Active nav text"],
  ["focus_ring", "Focus ring"],
  ["code_bg", "Code block background"],
  ["code_fg", "Code block text"],
  ["inline_code_bg", "Inline code background"],
  ["inline_code_fg", "Inline code text"],
  ["quote_bg", "Callout background"],
  ["quote_border", "Callout border"],
  ["quote_fg", "Callout text"],
  ["row_hover", "Table row hover"],
  ["open_bg", "Open answer background"],
  ["scroll_thumb", "Code scrollbar"],
  ["copy_bg", "Copy button background"],
  ["copy_fg", "Copy button text"],
  ["copy_border", "Copy button border"],
  ["copy_hover", "Copy button hover"],
];

// The app's own tokens are aliases of the palette below. Keeping the mapping in
// one place means a palette edit repaints the chrome without touching app.css.
export const COLOR_ALIASES = {
  bg: "paper",
  "bg-alt": "hover_bg",
  surface: "ivory",
  "surface-alt": "surface",
  text: "ink",
  "text-muted": "muted",
  border: "line",
  "border-strong": "stone",
  accent: "terra",
  "accent-hover": "terra_dark",
  "accent-soft": "active_bg",
  focus: "focus_ring",
  "row-hover": "row_hover",
};

// Documented house defaults, adjusted to the app's existing look so an existing
// install does not change appearance when this feature ships. Keys the app does
// not use keep the documentation values.
export const DEFAULT_LIGHT = {
  paper: "#f5f1eb",
  surface: "#f9f5ef",
  ivory: "#fffdfa",
  ink: "#2b2926",
  muted: "#665f57",
  stone: "#bfae9b",
  line: "#d9cec0",
  line_soft: "#ece8df",
  terra: "#8a4b2f",
  terra_dark: "#6f3a22",
  accent_strong: "#6f3a22",
  hover_bg: "#ece5db",
  active_bg: "#f2e4d9",
  active_fg: "#6f3a22",
  focus_ring: "#1d5fa8",
  code_bg: "#23211e",
  code_fg: "#f3eee5",
  inline_code_bg: "#eae7de",
  inline_code_fg: "#6f3b26",
  quote_bg: "#f8eee8",
  quote_border: "#e7cec2",
  quote_fg: "#3d3d3a",
  row_hover: "#f9f5ef",
  open_bg: "#fdf9f5",
  scroll_thumb: "#4a463f",
  copy_bg: "#2c2a26",
  copy_fg: "#d8d2c6",
  copy_border: "#4a463f",
  copy_hover: "#3a3732",
};

export const DEFAULT_DARK = {
  paper: "#1d1b19",
  surface: "#322e2a",
  ivory: "#2a2724",
  ink: "#f4efe8",
  muted: "#c3b9ad",
  stone: "#6b6054",
  line: "#4a443d",
  line_soft: "#2b2823",
  terra: "#e29a72",
  terra_dark: "#f0b08c",
  accent_strong: "#f0b08c",
  hover_bg: "#262321",
  active_bg: "#3b2a20",
  active_fg: "#f0b08c",
  focus_ring: "#8ec5ff",
  code_bg: "#141312",
  code_fg: "#f3eee5",
  inline_code_bg: "#322e28",
  inline_code_fg: "#f0b49a",
  quote_bg: "#2a211d",
  quote_border: "#4a332b",
  quote_fg: "#e6ded2",
  row_hover: "#322e2a",
  open_bg: "#262420",
  scroll_thumb: "#4a463f",
  copy_bg: "#2c2a26",
  copy_fg: "#d8d2c6",
  copy_border: "#4a463f",
  copy_hover: "#3a3732",
};

// Curated font dropdowns. Every stack is system-only and ends in a generic
// family, so picking one adds no network request.
export const FONT_CHOICES = {
  serif: [
    { label: "House serif (Iowan / Palatino)", value: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif' },
    { label: "Georgia", value: 'Georgia, "Times New Roman", Times, serif' },
    { label: "Charter / Sitka", value: 'Charter, "Bitstream Charter", "Sitka Text", Cambria, serif' },
    { label: "Cambria", value: 'Cambria, "Hoefler Text", Georgia, serif' },
    { label: "Constantia", value: 'Constantia, "Palatino Linotype", Palatino, Georgia, serif' },
    { label: "Palatino", value: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif' },
    { label: "Garamond", value: 'Garamond, "EB Garamond", "Times New Roman", serif' },
    { label: "Times", value: '"Times New Roman", Times, Georgia, serif' },
  ],
  sans: [
    { label: "House sans (system UI)", value: '-apple-system, "Segoe UI", Inter, Helvetica, Arial, sans-serif' },
    { label: "Segoe UI", value: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif' },
    { label: "Helvetica / Arial", value: 'Helvetica, Arial, "Segoe UI", sans-serif' },
    { label: "Verdana", value: "Verdana, Geneva, Tahoma, sans-serif" },
    { label: "Tahoma", value: "Tahoma, Verdana, Segoe UI, sans-serif" },
    { label: "Trebuchet MS", value: '"Trebuchet MS", "Lucida Grande", Tahoma, sans-serif' },
    { label: "Calibri", value: 'Calibri, "Segoe UI", Candara, Optima, sans-serif' },
    { label: "Gill Sans / Optima", value: '"Gill Sans", "Gill Sans MT", Optima, Candara, sans-serif' },
  ],
  mono: [
    { label: "House mono (JetBrains)", value: '"JetBrains Mono", "Cascadia Mono", Consolas, ui-monospace, monospace' },
    { label: "Cascadia Mono", value: '"Cascadia Mono", "Cascadia Code", Consolas, monospace' },
    { label: "Consolas", value: 'Consolas, "Lucida Console", Menlo, monospace' },
    { label: "SF Mono / Menlo", value: '"SF Mono", Menlo, Monaco, "DejaVu Sans Mono", monospace' },
    { label: "Courier New", value: '"Courier New", Courier, "Nimbus Mono PS", monospace' },
    { label: "Lucida Console", value: '"Lucida Console", Monaco, "DejaVu Sans Mono", monospace' },
  ],
};

export const TYPE_FIELDS = [
  { key: "fs_content", label: "Page text (reading column)", unit: "px", min: 18, max: 64, step: 0.5, cssVar: "--fs-content" },
  { key: "lh_content", label: "Page line height", unit: "", min: 1.1, max: 2.2, step: 0.01, cssVar: "--lh" },
  { key: "fs_ui", label: "Sidebar and chrome text", unit: "px", min: 11, max: 30, step: 0.5, cssVar: "--fs-ui" },
  { key: "lh_ui", label: "Chrome line height", unit: "", min: 1.1, max: 2.2, step: 0.01, cssVar: "--lh-ui" },
];

export const LAYOUT_FIELDS = [
  { key: "sidebar", label: "Sidebar width", unit: "px", min: 240, max: 560, step: 5, cssVar: "--sidebar-width" },
  { key: "measure", label: "Shell width (percent of the viewport)", unit: "%", min: 40, max: 100, step: 1, cssVar: "--measure" },
];

export const FONT_FIELDS = [
  { key: "serif", label: "Headings (serif)", cssVar: "--serif" },
  { key: "sans", label: "Body (sans)", cssVar: "--sans" },
  { key: "mono", label: "Code (mono)", cssVar: "--mono" },
];

export const DEFAULT_THEME = {
  mode: "system",
  type: { fs_content: 20, lh_content: 1.55, fs_ui: 17, lh_ui: 1.55 },
  layout: { sidebar: 240, measure: 100 },
  fonts: {
    serif: 'Georgia, "Times New Roman", serif',
    sans: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
    mono: '"Cascadia Mono", Consolas, "SFMono-Regular", ui-monospace, monospace',
  },
  colors: DEFAULT_LIGHT,
  dark: DEFAULT_DARK,
};

// Named starting points offered by the admin screen.
export const PRESETS = [
  { key: "house", label: "JMS house (25px / 20.4px)", patch: { type: { fs_content: 25, lh_content: 1.62, fs_ui: 20.4, lh_ui: 1.62 } } },
  { key: "app", label: "App default (20px / 17px)", patch: { type: { fs_content: 20, lh_content: 1.55, fs_ui: 17, lh_ui: 1.55 } } },
  { key: "compact", label: "Compact (18px / 15px)", patch: { type: { fs_content: 18, lh_content: 1.45, fs_ui: 15, lh_ui: 1.45 }, layout: { sidebar: 220, measure: 100 } } },
  { key: "large", label: "Large print (24px / 20px)", patch: { type: { fs_content: 24, lh_content: 1.7, fs_ui: 20, lh_ui: 1.65 } } },
];

const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FONT_KEYS = FONT_FIELDS.map((field) => field.key);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function toNumber(value, fallback, min, max) {
  const number = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

export function isColor(value) {
  return typeof value === "string" && COLOR_RE.test(value.trim());
}

// Font stacks end up inside a <style> block, so refuse anything that could
// close the declaration or the rule.
export function safeFontStack(value, fallback) {
  if (typeof value !== "string") return fallback;
  const stack = value.replace(/[;{}<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
  return stack || fallback;
}

function fontValue(key, value, fallback) {
  const stack = safeFontStack(value, fallback);
  const known = FONT_CHOICES[key].some((choice) => choice.value === stack);
  return { stack, known: known || stack === fallback };
}

// Merge a (possibly partial) theme over a base, clamping numbers and rejecting
// malformed colours and font stacks. Unknown keys are ignored.
export function mergeTheme(base, patch) {
  const theme = clone(base);
  if (!patch || typeof patch !== "object") return theme;
  if (["system", "light", "dark"].includes(patch.mode)) theme.mode = patch.mode;

  // Older saved preferences used a single scale and line height.
  const legacyScale = patch.text_scale;
  const legacyLeading = patch.line_height;
  if (patch.type === undefined && legacyScale !== undefined) {
    theme.type.fs_content = toNumber(Number(legacyScale) * base.type.fs_content, theme.type.fs_content, 18, 64);
  }
  if (patch.type === undefined && legacyLeading !== undefined) {
    theme.type.lh_content = toNumber(legacyLeading, theme.type.lh_content, 1.1, 2.2);
  }

  for (const field of TYPE_FIELDS) {
    const value = patch.type?.[field.key];
    if (value !== undefined) theme.type[field.key] = toNumber(value, theme.type[field.key], field.min, field.max);
  }
  for (const field of LAYOUT_FIELDS) {
    const value = patch.layout?.[field.key];
    if (value !== undefined) theme.layout[field.key] = toNumber(value, theme.layout[field.key], field.min, field.max);
  }
  for (const key of FONT_KEYS) {
    const value = patch.fonts?.[key];
    if (value !== undefined) theme.fonts[key] = safeFontStack(value, theme.fonts[key]);
  }
  for (const section of ["colors", "dark"]) {
    for (const [key] of COLOR_KEYS) {
      const value = patch[section]?.[key];
      if (value !== undefined && isColor(value)) theme[section][key] = value.trim().toLowerCase();
    }
  }
  return theme;
}

export function defaultTheme() {
  return clone(DEFAULT_THEME);
}

// Company default first, the user's own overrides second.
export function resolveTheme(companyTheme, userPrefs) {
  const base = mergeTheme(DEFAULT_THEME, companyTheme);
  return mergeTheme(base, userPrefs);
}

function applyPreset(theme, key) {
  const preset = PRESETS.find((entry) => entry.key === key);
  return preset ? mergeTheme(theme, preset.patch) : theme;
}

export function presetTheme(base, key) {
  return applyPreset(clone(base), key);
}

// --- CSS ------------------------------------------------------------------

function relativeLuminance(hex) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((c) => c + c).join("");
  const channels = [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

// Text on the accent colour: whichever of ink/ivory reads better.
function accentContrast(colors) {
  const onInk = contrast(colors.terra, colors.ink);
  const onIvory = contrast(colors.terra, colors.ivory);
  return onIvory >= onInk ? colors.ivory : colors.ink;
}

function numberText(value) {
  return String(Number(value.toFixed(2)));
}

function paletteBlock(colors, indent = "") {
  return COLOR_KEYS
    .map(([key]) => `${indent}  --theme-${key.replace(/_/g, "-")}: ${colors[key]};`)
    .join("\n");
}

function aliasBlock(colors, indent = "") {
  const aliases = Object.entries(COLOR_ALIASES)
    .map(([token, key]) => `${indent}  --${token}: var(--theme-${key.replace(/_/g, "-")});`);
  aliases.push(`${indent}  --accent-contrast: ${accentContrast(colors)};`);
  return aliases.join("\n");
}

export function themeCss(theme) {
  const type = theme.type;
  const layout = theme.layout;
  const light = [
    `:root {`,
    `  color-scheme: light;`,
    `  --fs-content: ${numberText(type.fs_content)}px;`,
    `  --fs-ui: ${numberText(type.fs_ui)}px;`,
    `  --lh-content: ${numberText(type.lh_content)};`,
    `  --lh-ui: ${numberText(type.lh_ui)};`,
    `  --lh: var(--lh-content);`,
    `  --sidebar-width: ${Math.round(layout.sidebar)}px;`,
    `  --measure: ${Math.round(layout.measure)};`,
    `  --shell-max: clamp(960px, calc(var(--measure) * 1vw), 1600px);`,
    `  --serif: ${theme.fonts.serif};`,
    `  --sans: ${theme.fonts.sans};`,
    `  --mono: ${theme.fonts.mono};`,
    `  --font-serif: var(--serif);`,
    `  --font-ui: var(--sans);`,
    `  --font-mono: var(--mono);`,
    paletteBlock(theme.colors),
    aliasBlock(theme.colors),
    `}`,
  ].join("\n");

  const dark = [
    paletteBlock(theme.dark),
    aliasBlock(theme.dark, "  "),
  ].join("\n");

  return [
    light,
    `:root[data-theme="dark"] {\n  color-scheme: dark;\n${dark}\n}`,
    `@media (prefers-color-scheme: dark) {\n  :root[data-theme="system"] {\n    color-scheme: dark;\n${dark}\n  }\n}`,
  ].join("\n");
}

// --- TOML export (same key names as assets/jms_theme.toml) -----------------

function tomlString(value) {
  return `'${String(value).replace(/'/g, "")}'`;
}

export function themeToToml(theme) {
  const lines = [
    "# JMS site theme - paste into jms_theme.toml or compare with the docs theme.",
    "# Keys match skills/make-jms-html/references/theme-keys.md.",
    "",
    `mode = "${theme.mode}"`,
    "",
    "[type]",
    ...TYPE_FIELDS.map((field) => `${field.key} = ${numberText(theme.type[field.key])}`),
    "",
    "[layout]",
    ...LAYOUT_FIELDS.map((field) => `${field.key} = ${Math.round(theme.layout[field.key])}`),
    "",
    "[fonts]",
    ...FONT_FIELDS.map((field) => `${field.key} = ${tomlString(theme.fonts[field.key])}`),
    "",
    "[colors]",
    ...COLOR_KEYS.map(([key]) => `${key} = "${theme.colors[key]}"`),
    "",
    "[dark]",
    ...COLOR_KEYS.map(([key]) => `${key} = "${theme.dark[key]}"`),
    "",
  ];
  return lines.join("\n");
}

// Read a theme back from posted form fields. Field names are
// type_<key>, layout_<key>, fonts_<key>, colors_<key> and dark_<key>.
export function themeFromForm(body, base) {
  const patch = { type: {}, layout: {}, fonts: {}, colors: {}, dark: {} };
  if (["system", "light", "dark"].includes(body.mode)) patch.mode = body.mode;
  for (const field of TYPE_FIELDS) {
    if (body[`type_${field.key}`] !== undefined) patch.type[field.key] = body[`type_${field.key}`];
  }
  for (const field of LAYOUT_FIELDS) {
    if (body[`layout_${field.key}`] !== undefined) patch.layout[field.key] = body[`layout_${field.key}`];
  }
  for (const field of FONT_FIELDS) {
    if (body[`fonts_${field.key}`] !== undefined) patch.fonts[field.key] = body[`fonts_${field.key}`];
  }
  for (const [key] of COLOR_KEYS) {
    if (body[`colors_${key}`] !== undefined) patch.colors[key] = body[`colors_${key}`];
    if (body[`dark_${key}`] !== undefined) patch.dark[key] = body[`dark_${key}`];
  }
  return mergeTheme(base, patch);
}

// The user's own overrides, kept minimal: colour scheme, type, fonts and the
// accent colours. Everything else stays at the company default.
export function userPreferencesFromForm(body) {
  const patch = { type: {}, fonts: {}, colors: {}, dark: {} };
  if (["system", "light", "dark"].includes(body.mode)) patch.mode = body.mode;
  for (const key of ["fs_content", "lh_content", "fs_ui", "lh_ui"]) {
    if (body[`type_${key}`] !== undefined) patch.type[key] = body[`type_${key}`];
  }
  for (const key of FONT_KEYS) {
    if (body[`fonts_${key}`] !== undefined) patch.fonts[key] = body[`fonts_${key}`];
  }
  for (const key of ["terra", "terra_dark", "paper", "ink"]) {
    if (body[`colors_${key}`] !== undefined) patch.colors[key] = body[`colors_${key}`];
    if (body[`dark_${key}`] !== undefined) patch.dark[key] = body[`dark_${key}`];
  }
  return patch;
}

export function fontOptions(key, current) {
  const choices = FONT_CHOICES[key];
  const options = choices.map((choice) => ({ ...choice, selected: choice.value === current }));
  if (!choices.some((choice) => choice.value === current)) {
    options.push({ label: "Custom (saved stack)", value: current, selected: true });
  }
  return options;
}
