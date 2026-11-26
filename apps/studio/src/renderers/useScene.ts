import { useEffect, useState } from 'react'
import type { PoneyDocument, View } from '@poney/core'
import { layoutView, type SceneBase, type ViewLayoutOptions } from '@poney/layout'
import { useDoc, useStudio } from '@/features/store'

const cache = new WeakMap<PoneyDocument, Map<string, Promise<SceneBase>>>()

/** Resolves once the web fonts are ready, so text measurements match rendering. */
const fontsReady: Promise<unknown> = document.fonts
  ? Promise.all([
      document.fonts.load('400 13px "Hanken Grotesk Variable"'),
      document.fonts.load('600 13px "Hanken Grotesk Variable"'),
      document.fonts.load('400 12px "JetBrains Mono Variable"'),
    ]).catch(() => undefined)
  : Promise.resolve()

function scene(doc: PoneyDocument, view: View, options: ViewLayoutOptions) {
  let perDoc = cache.get(doc)
  if (!perDoc) cache.set(doc, (perDoc = new Map()))
  const key = `${view.id}|${JSON.stringify(options)}`
  let pending = perDoc.get(key)
  if (!pending) {
    pending = fontsReady.then(() => layoutView(doc, view, options))
    perDoc.set(key, pending)
  }
  return pending
}

/**
 * Lays out a view and returns its scene. While a new layout is computed for
 * the same view (for example after expanding a group) the previous scene
 * stays on screen, so nothing flickers.
 */
export function useScene(view: View): { scene?: SceneBase; error?: string } {
  const doc = useDoc()
  const ui = useStudio((s) => s.viewUi[view.id])
  const [state, setState] = useState<{ viewId: string; scene?: SceneBase; error?: string }>({ viewId: view.id })

  useEffect(() => {
    let live = true
    const options: ViewLayoutOptions = { collapsed: ui?.collapsed, expanded: ui?.expandedTables, controlFlow: ui?.controlFlow }
    scene(doc, view, options).then(
      (s) => live && setState({ viewId: view.id, scene: s }),
      (e: unknown) => live && setState({ viewId: view.id, error: e instanceof Error ? e.message : String(e) }),
    )
    return () => {
      live = false
    }
  }, [doc, view, ui?.collapsed, ui?.expandedTables, ui?.controlFlow])

  return state.viewId === view.id ? state : {}
}
