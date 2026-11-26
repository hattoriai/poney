/**
 * Session settings: the choices an agent offers for a session (model, effort,
 * mode, fast mode…), in one shape whatever way the agent offers them.
 *
 * ACP has "config options" (Claude Code and Codex use them) and, older, a list
 * of modes and a list of models (OpenCode uses those). The Studio shows them
 * all the same way, and changes them through `applySetting`.
 */
import { methods, type ClientConnection, type SessionConfigOption } from '@agentclientprotocol/sdk'
import type { SessionSetting } from '../live/types'

const CATEGORY: Record<string, SessionSetting['category']> = { model: 'model', thought_level: 'effort', mode: 'mode', speed: 'speed' }

type Option = { value: string; name: string; description?: string | null }

/** An agent marks its recommendation in the name, e.g. "Default (recommended)". */
function withRecommendation<T extends { name: string }>(o: T): T & { recommended?: boolean } {
  const m = /\s*\(recommended\)\s*$/i.exec(o.name)
  return m ? { ...o, name: o.name.slice(0, m.index), recommended: true } : o
}

export function fromConfigOptions(options: SessionConfigOption[] = []): SessionSetting[] {
  return options.map((o) => {
    const category = CATEGORY[o.category ?? ''] ?? 'other'
    if (o.type === 'boolean') return { id: o.id, name: o.name, category, kind: 'boolean' as const, current: o.currentValue, options: [], via: 'config' as const }
    const flat: Option[] = (o.options as (Option | { group: string; name: string; options: Option[] })[]).flatMap((x) => ('group' in x ? x.options.map((y) => ({ ...y, group: x.name })) : [x]))
    const choices = flat.map(withRecommendation).map(({ value, name, description, recommended, ...rest }) => ({
      value,
      name,
      ...(description ? { description } : {}),
      ...('group' in rest ? { group: (rest as { group: string }).group } : {}),
      ...(recommended ? { recommended } : {}),
    }))
    // The recommended choice comes first.
    choices.sort((a, b) => Number(!!b.recommended) - Number(!!a.recommended))
    return { id: o.id, name: o.name, category, kind: 'select' as const, current: o.currentValue, options: choices, via: 'config' as const }
  })
}

interface ModelState {
  currentModelId?: string
  availableModels?: { modelId: string; name: string; description?: string | null }[]
}
interface ModeState {
  currentModeId?: string
  availableModes?: { id: string; name: string; description?: string | null }[]
}

/** Settings from the older lists, for agents without config options (only what config options do not already cover). */
export function fromLists(models: ModelState | null | undefined, modes: ModeState | null | undefined, have: SessionSetting[]): SessionSetting[] {
  const out: SessionSetting[] = []
  if (models?.availableModels?.length && !have.some((s) => s.category === 'model'))
    out.push({ id: 'model', name: 'Model', category: 'model', kind: 'select', current: models.currentModelId ?? '', options: models.availableModels.map((m) => ({ value: m.modelId, name: m.name, ...(m.description ? { description: m.description } : {}) })), via: 'model' })
  if (modes?.availableModes?.length && !have.some((s) => s.category === 'mode'))
    out.push({ id: 'mode', name: 'Mode', category: 'mode', kind: 'select', current: modes.currentModeId ?? '', options: modes.availableModes.map((m) => ({ value: m.id, name: m.name, ...(m.description ? { description: m.description } : {}) })), via: 'mode' })
  return out
}

/** Changes a setting in the agent. Returns the settings as they are after the change. */
export async function applySetting(connection: ClientConnection, sessionId: string, settings: SessionSetting[], id: string, value: string | boolean): Promise<SessionSetting[]> {
  const s = settings.find((x) => x.id === id)
  if (!s) throw new Error(`No setting "${id}"`)
  if (s.via === 'config') {
    const res = await connection.agent.request(
      methods.agent.session.setConfigOption,
      s.kind === 'boolean' ? { sessionId, configId: id, type: 'boolean', value: Boolean(value) } : { sessionId, configId: id, value: String(value) },
    )
    const next = fromConfigOptions(res.configOptions)
    return [...next, ...settings.filter((x) => x.via !== 'config')]
  }
  if (s.via === 'mode') await connection.agent.request(methods.agent.session.setMode, { sessionId, modeId: String(value) })
  // Choosing a model this way is not yet stable in ACP; agents that offer the list accept it.
  else await connection.agent.request('session/set_model', { sessionId, modelId: String(value) })
  return settings.map((x) => (x.id === id ? { ...x, current: value } : x))
}
