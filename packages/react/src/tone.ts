import type { Tone } from '@hattoriai/poney-core'

/** Named pigments map to theme variables (--poney-<name>); hex colors pass through. */
export const toneColor = (tone: Tone | string) => (tone.startsWith('#') ? tone : `var(--poney-${tone})`)
/** A pale wash of a tone over paper, for fills. */
export const toneWash = (tone: Tone | string, amount = 10) => `color-mix(in srgb, ${toneColor(tone)} ${amount}%, var(--poney-paper-raised))`
