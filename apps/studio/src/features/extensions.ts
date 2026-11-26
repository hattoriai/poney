import type { ReactNode } from 'react'
import type { ModelIndex, Ref, PoneyDocument, PoneyExtension } from '@poney/core'
import { registerExtensionLayout, type ExtensionLayout } from '@poney/layout'
import { registerDiagram } from '@/renderers/registry'
import type { AnyDiagramModule } from '@/renderers/types'

/**
 * A studio extension pairs a format extension (from its own package, with no
 * UI) with what the studio needs to show it: renderers for its view types,
 * their layouts, and extra inspector sections.
 */
export interface InspectorSectionProps {
  ref: Ref
  doc: PoneyDocument
  idx: ModelIndex
}

export interface InspectorSection {
  id: string
  title: string
  /** Return null when the section has nothing to say about this ref. */
  render(props: InspectorSectionProps): ReactNode | null
}

export interface StudioExtension {
  core: PoneyExtension
  diagrams?: AnyDiagramModule[]
  layouts?: Record<string, ExtensionLayout>
  inspector?: InspectorSection[]
}

const extensions: StudioExtension[] = []

export function registerStudioExtension(ext: StudioExtension) {
  extensions.push(ext)
  ext.diagrams?.forEach(registerDiagram)
  Object.entries(ext.layouts ?? {}).forEach(([key, layout]) => registerExtensionLayout(key, layout))
}

/** Format extensions the studio understands, for validation. */
export const knownExtensions = () => extensions.map((e) => e.core)

export const inspectorSections = () => extensions.flatMap((e) => e.inspector ?? [])
