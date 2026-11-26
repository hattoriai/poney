/**
 * The colour tokens, by name: `--poney-<name>` in CSS (styles/tokens.css,
 * which a test keeps equal to this table), and these values where CSS
 * variables cannot be resolved (static SVG, PNG).
 */
export const THEMES = {
  light: {
    plaster: '#eef0ec', paper: '#fbfbf9', 'paper-raised': '#ffffff', sunken: '#e5e8e3',
    ink: '#1d2230', 'ink-2': '#4e5566', 'ink-3': '#848a97', 'ink-4': '#b3b8c1', rule: '#dcdfd8', 'rule-strong': '#c8ccc4',
    accent: '#b24a32', 'accent-wash': '#f7ebe7', 'accent-ring': '#b24a3240', lapis: '#3a5a9e', malachite: '#2e7656', ochre: '#a8761c', umber: '#7d5a43', tyrian: '#7a4a88', slate: '#56627a', verdigris: '#26807f',
    success: '#2e7656', failure: '#9c3554',
    new: '#1d8a4e', 'new-wash': '#ecf8f0', changed: '#b86e0b', 'changed-wash': '#fdf5e6', removed: '#c03550', 'removed-wash': '#fcf0f2',
    'story-node': '#ffffff', 'story-line': '#8c939e', 'story-rule': '#d7dade',
  },
  dark: {
    plaster: '#15181e', paper: '#1b1f27', 'paper-raised': '#212631', sunken: '#12151a',
    ink: '#e6e8ec', 'ink-2': '#aeb4c0', 'ink-3': '#7c8391', 'ink-4': '#535a67', rule: '#2a2f39', 'rule-strong': '#3a404c',
    accent: '#e2765b', 'accent-wash': '#3a2621', 'accent-ring': '#e2765b4d', lapis: '#7f9ce0', malachite: '#5fb68d', ochre: '#d6a64c', umber: '#c19a7f', tyrian: '#b98ac8', slate: '#98a3b9', verdigris: '#58bcba',
    success: '#5fb68d', failure: '#e07a98',
    new: '#4fc887', 'new-wash': '#15281f', changed: '#e3a54a', 'changed-wash': '#2b2416', removed: '#ef7f97', 'removed-wash': '#2e1a20',
    'story-node': '#1f242d', 'story-line': '#7d8592', 'story-rule': '#363c48',
  },
} as const

export type ThemeName = keyof typeof THEMES

/** The font tokens, --poney-font-sans and --poney-font-mono. */
export const FONTS = {
  sans: "'Hanken Grotesk Variable', 'Hanken Grotesk', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
} as const
