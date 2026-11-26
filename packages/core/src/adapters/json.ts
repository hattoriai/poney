import type { PoneyDocument } from '../schema/document'
import { validateDocument, type ValidateOptions, type ValidationResult } from '../validation/validate'

/**
 * JSON is the canonical serialization. Output is stable: two-space indent,
 * keys in schema order, defaults included, so diffs stay readable.
 */
export function toJSON(doc: PoneyDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`
}

export type ParseTextResult = ValidationResult | { ok: false; issues: { path: string; message: string; severity: 'error' }[]; document?: undefined }

export function fromJSON(text: string, options: ValidateOptions = {}): ParseTextResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { ok: false, issues: [{ path: '', message: `Not valid JSON: ${(e as Error).message}`, severity: 'error' }] }
  }
  return validateDocument(raw, options)
}

/** True when text looks like a Poney document rather than other JSON. */
export function looksLikePoney(text: string): boolean {
  const t = text.trimStart()
  return t.startsWith('{') && /"poneyVersion"\s*:/.test(t)
}
