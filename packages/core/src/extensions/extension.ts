import type { z } from 'zod'
import type { PoneyDocument } from '../schema/document'
import type { ModelIndex } from '../model/query'

/**
 * Poney extensions.
 *
 * The core format covers what most software descriptions need. Extensions
 * add what it does not, in the way editors such as ProseMirror let a schema
 * grow: by declaring new kinds and new data, never by changing core meaning.
 *
 * An extension has a name, which is also its namespace. It can define:
 *
 * - entity kinds and relationship kinds, used as "<name>/<kind>";
 * - facets: typed data attached to core elements under `ext["<name>"]`;
 * - view types, used as `{ "type": "extension", "extension": "<name>/<view>" }`;
 * - extra referential checks.
 *
 * Everything an extension adds is plain JSON in the document, so readers in
 * any language can keep, pass through or interpret it. See spec/SPEC.md.
 */

export type FacetTarget = 'entity' | 'relationship' | 'dataType' | 'capability' | 'view'

export interface KindDefinition {
  label: string
  description?: string
}

export interface ViewTypeDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> {
  label: string
  description?: string
  /** Validates the view's `data`. */
  schema: S
}

export interface ExtensionContext {
  index: ModelIndex
  report(path: string, message: string): void
}

/** What an extension's lints get: the model, and a way to warn. */
export interface ExtensionLintContext {
  index: ModelIndex
  /**
   * A warning. `code` is stable and starts with the extension's name, e.g.
   * "security-unencrypted-crossing"; `hint` says how to fix it.
   */
  warn(path: string, code: string, message: string, hint: string): void
}

export interface PoneyExtension {
  /** Lowercase namespace, e.g. "ownership". */
  name: string
  version: string
  description?: string
  entityKinds?: Record<string, KindDefinition>
  relationshipKinds?: Record<string, KindDefinition>
  facets?: Partial<Record<FacetTarget, z.ZodTypeAny>>
  views?: Record<string, ViewTypeDefinition>
  /** Extra checks, such as references from facets to entities. */
  validate?(doc: PoneyDocument, ctx: ExtensionContext): void
  /**
   * Warnings about a valid document, in the extension's own terms, e.g.
   * "personal data leaves a trust zone without encryption". They never make
   * a document invalid.
   */
  lint?(doc: PoneyDocument, ctx: ExtensionLintContext): void
}

/** Identity function that keeps the extension's literal types. */
export function defineExtension<const T extends PoneyExtension>(extension: T): T {
  return extension
}

/** The namespace part of "<name>/<kind>", or undefined for core kinds. */
export function namespaceOf(kind: string): string | undefined {
  const slash = kind.indexOf('/')
  return slash > 0 ? kind.slice(0, slash) : undefined
}

/**
 * Reads an extension facet from an element, parsed by the extension's
 * schema. Returns undefined when absent or invalid.
 */
export function readFacet<E extends PoneyExtension, T extends FacetTarget>(
  extension: E,
  target: T,
  element: { ext?: Record<string, unknown> } | undefined,
): (E['facets'] extends Partial<Record<T, infer S>> ? (S extends z.ZodTypeAny ? z.infer<S> : never) : never) | undefined {
  const schema = extension.facets?.[target]
  const raw = element?.ext?.[extension.name]
  if (!schema || raw === undefined) return undefined
  const parsed = schema.safeParse(raw)
  return parsed.success ? parsed.data : undefined
}

/** Reads the data of an extension view, parsed by its schema. */
export function readViewData<E extends PoneyExtension, K extends keyof NonNullable<E['views']> & string>(
  extension: E,
  viewType: K,
  view: { type: string; extension?: string; data?: unknown },
): z.infer<NonNullable<E['views']>[K]['schema']> | undefined {
  if (view.type !== 'extension' || view.extension !== `${extension.name}/${viewType}`) return undefined
  const parsed = extension.views?.[viewType]?.schema.safeParse(view.data)
  return parsed?.success ? parsed.data : undefined
}
