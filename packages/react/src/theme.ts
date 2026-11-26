/**
 * Colour tokens of the story renderers, for hosts that cannot resolve CSS
 * variables (static SVG, PNG). The studio defines the same tokens in CSS.
 */
export const THEMES = {
  light: {
    plaster: '#eef0ec', paper: '#fbfbf9', 'paper-raised': '#ffffff', sunken: '#e5e8e3',
    ink: '#1d2230', 'ink-2': '#4e5566', 'ink-3': '#848a97', 'ink-4': '#b3b8c1', rule: '#dcdfd8', 'rule-strong': '#c8ccc4',
    poney: '#b24a32', 'poney-wash': '#f7ebe7', lapis: '#3a5a9e', malachite: '#2e7656', ochre: '#a8761c', umber: '#7d5a43', tyrian: '#7a4a88', slate: '#56627a', verdigris: '#26807f',
    success: '#2e7656', failure: '#9c3554',
    new: '#1d8a4e', 'new-wash': '#ecf8f0', changed: '#b86e0b', 'changed-wash': '#fdf5e6', removed: '#c03550', 'removed-wash': '#fcf0f2',
    'story-node': '#ffffff', 'story-line': '#8c939e', 'story-rule': '#d7dade',
  },
  dark: {
    plaster: '#15181e', paper: '#1b1f27', 'paper-raised': '#212631', sunken: '#12151a',
    ink: '#e6e8ec', 'ink-2': '#aeb4c0', 'ink-3': '#7c8391', 'ink-4': '#535a67', rule: '#2a2f39', 'rule-strong': '#3a404c',
    poney: '#e2765b', 'poney-wash': '#3a2621', lapis: '#7f9ce0', malachite: '#5fb68d', ochre: '#d6a64c', umber: '#c19a7f', tyrian: '#b98ac8', slate: '#98a3b9', verdigris: '#58bcba',
    success: '#5fb68d', failure: '#e07a98',
    new: '#4fc887', 'new-wash': '#15281f', changed: '#e3a54a', 'changed-wash': '#2b2416', removed: '#ef7f97', 'removed-wash': '#2e1a20',
    'story-node': '#1f242d', 'story-line': '#7d8592', 'story-rule': '#363c48',
  },
} as const

export type ThemeName = keyof typeof THEMES
