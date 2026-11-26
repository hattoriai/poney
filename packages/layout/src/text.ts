/**
 * Text measurement for layout. Layouts size nodes from their labels, so they
 * need to know how wide text is. The measurer is injectable: browsers use a
 * canvas by default; Node, workers or other renderers can set their own.
 */
export type FontFamily = 'sans' | 'mono'
export type TextMeasurer = (text: string, size: number, weight: number, family: FontFamily) => number

/** Width estimate without any font engine. Good enough for tests and servers. */
export const estimateText: TextMeasurer = (text, size, weight, family) =>
  text.length * size * (family === 'mono' ? 0.6 : weight >= 600 ? 0.56 : 0.52)

let fonts: Record<FontFamily, string> = {
  sans: '"Hanken Grotesk Variable", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono Variable", ui-monospace, monospace',
}

function canvasMeasurer(): TextMeasurer | undefined {
  if (typeof document === 'undefined') return undefined
  const ctx = document.createElement('canvas').getContext('2d')
  if (!ctx) return undefined
  return (text, size, weight, family) => {
    ctx.font = `${weight} ${size}px ${fonts[family]}`
    return ctx.measureText(text).width
  }
}

let measurer: TextMeasurer | undefined

/** Replaces the text measurer, for example with a server-side font engine. */
export function setTextMeasurer(fn: TextMeasurer) {
  measurer = fn
}

/** Sets the font stacks the default canvas measurer uses. */
export function setFonts(next: Partial<Record<FontFamily, string>>) {
  fonts = { ...fonts, ...next }
  measurer = undefined
}

export function measure(text: string, size = 13, weight = 400, family: FontFamily = 'sans'): number {
  measurer ??= canvasMeasurer() ?? estimateText
  return measurer(text, size, weight, family)
}

/** Wraps text into lines no wider than `width`, adding an ellipsis past `maxLines`. */
export function wrap(text: string, width: number, size = 13, weight = 400, maxLines = 2): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate, size, weight) <= width || !line) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && measure(`${last}…`, size, weight) > width) last = last.slice(0, -1).trimEnd()
  kept[maxLines - 1] = `${last}…`
  return kept
}

/** Truncates a single line to `width`. */
export function clip(text: string, width: number, size = 13, weight = 400, family: FontFamily = 'sans'): string {
  if (measure(text, size, weight, family) <= width) return text
  let t = text
  while (t.length > 1 && measure(`${t}…`, size, weight, family) > width) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}


