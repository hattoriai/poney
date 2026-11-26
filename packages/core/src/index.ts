/**
 * @hattoriai/poney-core — the Poney format without any user interface.
 *
 * Use it to read, validate, query, change and convert Poney documents in
 * any JavaScript runtime. Readers in other languages use spec/SPEC.md and
 * spec/poney.schema.json instead.
 */
export * from './schema/document'
export * from './validation/validate'
export * from './model/refs'
export * from './model/query'
export * from './model/walkthrough'
export * from './commands/commands'
export * from './commands/history'
export * from './extensions/extension'
export * from './adapters/json'
export * from './adapters/mermaid'
export * from './defaults'
export * from './projections'
export * from './validation/lint'
export * from './text/inline'
export { upgradeDocument } from './upgrade'
