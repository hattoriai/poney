import { create } from 'zustand'
import type { AgentStatus, ContextItem, Message } from '@poney/agent/live'
import { createHistory, execute, indexOf, redo, refKey, undo, type Command, type History, type Ref, type PoneyDocument } from '@poney/core'

/**
 * Application state. This is interaction state only — what is open, what is
 * selected, what is hovered. The canonical model lives in `history.present`
 * and changes only through commands.
 */

export const OVERVIEW = '__overview'
/** Walkthroughs open at "walk:<id>". */
export const WALK = 'walk:'
export const walkId = (viewId: string) => (viewId.startsWith(WALK) ? viewId.slice(WALK.length) : undefined)

export interface ViewUiState {
  /** Architecture: containers and groups the user opened or closed, overriding the view. */
  collapsed?: string[]
  /** ERD: tables showing every field. */
  expandedTables?: string[]
  /** Data flow: show relationships without data. */
  controlFlow?: boolean
  /** Dependency: highlight transitive dependencies, not only direct ones. */
  transitive?: boolean
}

interface Place {
  viewId: string
  selection: Ref | null
}

export interface FocusRequest {
  ref: Ref | null
  /** 'center' keeps the zoom; 'zoom' frames the element; 'fit' frames the whole diagram. */
  mode: 'center' | 'zoom' | 'fit' | 'reset'
  nonce: number
}

export interface Project {
  id: string
  doc: PoneyDocument
  origin: 'example' | 'imported' | 'pasted' | 'live'
}


export interface LiveStatus {
  state: 'off' | 'connecting' | 'on' | 'lost'
  url?: string
  revision?: number
}

export type { AgentStatus, ContextItem, Message }

/** A right-click menu: on an element, on selected text, or on a diagram's empty space. */
/** An agent can take a question now: one runs from the Studio, or one in its own session listens. Every "ask the agent" control depends on it. */
export const agentReady = (s: { live: { state: string }; agent: AgentStatus }) => s.live.state === 'on' && (!!s.agent.session || s.agent.listening)

export type ContextMenu = { x: number; y: number } & ({ on: 'element'; ref: Ref } | { on: 'text'; text: string } | { on: 'diagram'; viewId: string } | { on: 'code'; path: string; line: number; text: string; note?: string })

/** Where a name is drawn on screen, so its field can sit exactly on it. */
export interface Renaming {
  ref: Ref
  value: string
  /** The drawn name (hidden while it is edited), or the whole element when the name is drawn elsewhere. */
  rect: { x: number; y: number; w: number; h: number }
  /** Room to grow, from the name's start to the element's edge. */
  room: number
  font: { size: number; weight: string }
  align: 'left' | 'center'
  /** The drawn text, hidden while the field covers it. */
  text?: SVGTextElement
}

interface State {
  projects: Project[]
  projectId: string
  history: History
  viewId: string
  selection: Ref | null
  hover: Ref | null
  focus: FocusRequest | null
  back: Place[]
  forward: Place[]
  sidebarOpen: boolean
  inspectorOpen: boolean
  paletteOpen: boolean
  theme: 'light' | 'dark'
  pinned: string[]
  viewUi: Record<string, ViewUiState>
  notice: string | null
  live: LiveStatus
  /** The walkthrough scene in view, for the live link. */
  activeScene: string | null
  /** The conversation with an agent, as the live hub keeps it. */
  conversation: Message[]
  /** Who answers: an agent the Studio started, or one that listens over MCP. */
  agent: AgentStatus
  /** The dialog that picks a workspace and starts an agent. */
  connectOpen: boolean
  /** The agent panel. */
  agentPanelOpen: boolean
  /** The file the open document is saved to, when Poney on this computer keeps it. */
  liveFile: string | null
  /** The dialog that opens a .poney file from this computer. */
  fileOpen: boolean
  /** The project's folder (a repository), where agents work. */
  project: { root: string; name: string } | null
  /** The dialog that opens a folder as the project. */
  projectOpen: boolean
  /** What the next question is about: chips in the message box. */
  chips: ContextItem[]
  /** Pointing mode: the next click on an element adds it as a chip. */
  pointing: boolean
  contextMenu: ContextMenu | null
  /** An element being renamed where it is drawn: its ref, its name, and where it is on screen. */
  renaming: Renaming | null
  /** A request to scroll a walkthrough to a scene, e.g. from a reply. */
  jump: { scene: string; nonce: number } | null
  /** The start page shows: nothing is open yet, or the person asked for it. */
  startOpen: boolean
}

interface Actions {
  loadDocument(doc: PoneyDocument, origin?: Project['origin']): void
  /** Replaces the open document with a new revision, keeping the reader's place when it still exists. */
  reviseDocument(doc: PoneyDocument, origin: Project['origin']): void
  setLive(live: LiveStatus): void
  setActiveScene(id: string | null): void
  setConversation(messages: Message[]): void
  /** Adds a message, or replaces the one with the same id. */
  putMessage(message: Message): void
  setAgent(agent: AgentStatus): void
  setConnectOpen(open: boolean): void
  setAgentPanelOpen(open: boolean): void
  setLiveFile(path: string | null): void
  setFileOpen(open: boolean): void
  setProject(project: State['project']): void
  setProjectOpen(open: boolean): void
  setRenaming(renaming: State['renaming']): void
  addChip(chip: ContextItem): void
  removeChip(index: number): void
  clearChips(): void
  /** Returns the waiting chips and clears them, in one step, so each chip lands once. */
  takeChips(): ContextItem[]
  setPointing(on: boolean): void
  openContextMenu(menu: ContextMenu | null): void
  jumpTo(scene: string): void
  showStart(open: boolean): void
  switchProject(id: string): void
  /** Adds a project to the list without opening it. */
  keepProject(doc: PoneyDocument, origin: Project['origin']): void
  importOpen: boolean
  setImportOpen(open: boolean, text?: string): void
  importText: string
  shortcutsOpen: boolean
  setShortcutsOpen(open: boolean): void
  dispatch(command: Command): void
  undo(): void
  redo(): void
  navigate(viewId: string, options?: { select?: Ref | null; focus?: FocusRequest['mode'] }): void
  goBack(): void
  goForward(): void
  select(ref: Ref | null, options?: { focus?: FocusRequest['mode'] }): void
  setHover(ref: Ref | null): void
  requestFocus(mode: FocusRequest['mode'], ref?: Ref | null): void
  toggleSidebar(open?: boolean): void
  toggleInspector(open?: boolean): void
  setPaletteOpen(open: boolean): void
  toggleTheme(): void
  togglePin(viewId: string): void
  updateViewUi(viewId: string, patch: Partial<ViewUiState>): void
  notify(message: string | null): void
}

const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`poney:${key}`)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`poney:${key}`, JSON.stringify(value))
    } catch {
      /* storage can be unavailable; preferences are a convenience */
    }
  },
}

let nonce = 0
const focusOf = (mode: FocusRequest['mode'], ref: Ref | null = null): FocusRequest => ({ ref, mode, nonce: ++nonce })

export const useStudio = create<State & Actions>()((set, get) => ({
  projects: [],
  projectId: '',
  importOpen: false,
  importText: '',
  shortcutsOpen: false,
  setImportOpen: (open, text) => set({ importOpen: open, importText: text ?? (open ? get().importText : '') }),
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  history: undefined as unknown as History,
  viewId: OVERVIEW,
  selection: null,
  hover: null,
  focus: null,
  back: [],
  forward: [],
  sidebarOpen: typeof window === 'undefined' || window.innerWidth > 900,
  inspectorOpen: typeof window === 'undefined' || window.innerWidth > 1180,
  paletteOpen: false,
  theme: storage.get<'light' | 'dark'>('theme', 'light'),
  pinned: storage.get<string[]>('pinned', []),
  viewUi: {},
  notice: null,
  live: { state: 'off' },
  activeScene: null,
  conversation: [],
  agent: { session: null, listening: false },
  jump: null,
  startOpen: true,
  showStart: (startOpen) => set({ startOpen: startOpen || !get().history }),
  setLive: (live) => set({ live }),
  setActiveScene: (activeScene) => set({ activeScene }),
  setConversation: (conversation) => set({ conversation }),
  putMessage(message) {
    const list = get().conversation
    const at = list.findIndex((m) => m.id === message.id)
    set({ conversation: at < 0 ? [...list, message] : list.map((m, i) => (i === at ? message : m)) })
  },
  setAgent: (agent) => set({ agent }),
  connectOpen: false,
  agentPanelOpen: false,
  setConnectOpen: (connectOpen) => set({ connectOpen }),
  setAgentPanelOpen: (agentPanelOpen) => set({ agentPanelOpen }),
  liveFile: null,
  fileOpen: false,
  setLiveFile: (liveFile) => set({ liveFile }),
  setFileOpen: (fileOpen) => set({ fileOpen }),
  project: null,
  projectOpen: false,
  setProject: (project) => set({ project }),
  setProjectOpen: (projectOpen) => set({ projectOpen }),
  renaming: null,
  setRenaming: (renaming) => set({ renaming }),
  chips: [],
  pointing: false,
  contextMenu: null,
  addChip(chip) {
    const chips = get().chips
    const same = chips.some((c) => (chip.ref ? c.ref === chip.ref : c.quote === chip.quote))
    set({ chips: same ? chips : [...chips, chip] })
  },
  removeChip: (index) => set({ chips: get().chips.filter((_, i) => i !== index) }),
  clearChips: () => set({ chips: [] }),
  takeChips() {
    const chips = get().chips
    if (chips.length) set({ chips: [] })
    return chips
  },
  setPointing: (pointing) => set({ pointing }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  jumpTo: (scene) => set({ jump: { scene, nonce: Date.now() } }),
  reviseDocument(doc, origin) {
    const { viewId, selection, projectId } = get()
    if (doc.project.id !== projectId) return get().loadDocument(doc, origin)
    const idx = indexOf(doc)
    // From an empty project (a folder an agent just started in), go to what the agent opened first.
    const before = get().history?.present
    const wasEmpty = !!before && before.views.length === 0 && before.walkthroughs.length === 0
    const stillThere = !wasEmpty && (viewId === OVERVIEW || idx.views.has(viewId) || doc.walkthroughs.some((w) => `${WALK}${w.id}` === viewId))
    const keep = selection && idx.exists(selection) ? selection : null
    set({
      startOpen: false,
      projects: [...get().projects.filter((p) => p.id !== doc.project.id), { id: doc.project.id, doc, origin }],
      history: createHistory(doc),
      viewId: stillThere ? viewId : doc.walkthroughs[0] ? `${WALK}${doc.walkthroughs[0].id}` : (doc.project.defaultView ?? doc.views[0]?.id ?? OVERVIEW),
      selection: keep,
      hover: null,
    })
  },

  loadDocument(doc, origin = 'imported') {
    const { projects, projectId, history } = get()
    // Keep edits to the project we leave.
    const saved = projects.map((p) => (p.id === projectId && history ? { ...p, doc: history.present } : p))
    const others = saved.filter((p) => p.id !== doc.project.id)
    const initial = doc.walkthroughs[0] ? `${WALK}${doc.walkthroughs[0].id}` : (doc.project.defaultView ?? doc.views[0]?.id ?? OVERVIEW)
    set({
      startOpen: false,
      projects: [...others, { id: doc.project.id, doc, origin }],
      projectId: doc.project.id,
      history: createHistory(doc),
      viewId: initial,
      selection: null,
      hover: null,
      back: [],
      forward: [],
      viewUi: {},
      focus: null,
    })
  },

  keepProject(doc, origin) {
    set({ projects: [...get().projects.filter((p) => p.id !== doc.project.id), { id: doc.project.id, doc, origin }] })
  },

  switchProject(id) {
    const target = get().projects.find((p) => p.id === id)
    if (!target || id === get().projectId) return
    get().loadDocument(target.doc, target.origin)
  },

  dispatch(command) {
    try {
      set({ history: execute(get().history, command) })
    } catch (error) {
      set({ notice: error instanceof Error ? error.message : String(error) })
    }
  },
  undo: () => set({ history: undo(get().history) }),
  redo: () => set({ history: redo(get().history) }),

  navigate(viewId, options = {}) {
    const { viewId: current, selection, history } = get()
    const idx = indexOf(history.present)
    let nextSelection: Ref | null = options.select !== undefined ? options.select : selection
    // Keep the selection across views when the new view also shows it.
    if (nextSelection && viewId !== OVERVIEW && !viewId.startsWith(WALK)) {
      const view = idx.views.get(viewId)
      if (!view || !idx.viewShows(view, nextSelection)) nextSelection = options.select ?? null
    }
    if (viewId === OVERVIEW || viewId.startsWith(WALK)) nextSelection = options.select ?? null
    const changed = current !== viewId
    // A walkthrough is a reading page: give it the width.
    if (changed && viewId.startsWith(WALK) && typeof window !== 'undefined' && window.innerWidth < 1700) set({ sidebarOpen: false })
    set({
      viewId,
      selection: nextSelection,
      hover: null,
      back: changed ? [...get().back, { viewId: current, selection }].slice(-50) : get().back,
      forward: changed ? [] : get().forward,
      focus: options.focus ? focusOf(options.focus, nextSelection) : nextSelection ? focusOf('center', nextSelection) : null,
    })
  },

  goBack() {
    const { back, viewId, selection } = get()
    const prev = back[back.length - 1]
    if (!prev) return
    set({
      viewId: prev.viewId,
      selection: prev.selection,
      back: back.slice(0, -1),
      forward: [{ viewId, selection }, ...get().forward],
      focus: prev.selection ? focusOf('center', prev.selection) : null,
    })
  },

  goForward() {
    const { forward, viewId, selection } = get()
    const next = forward[0]
    if (!next) return
    set({
      viewId: next.viewId,
      selection: next.selection,
      forward: forward.slice(1),
      back: [...get().back, { viewId, selection }],
      focus: next.selection ? focusOf('center', next.selection) : null,
    })
  },

  select(ref, options = {}) {
    const prev = get().selection
    if (ref && prev && refKey(ref) === refKey(prev) && !options.focus) return
    set({ selection: ref, focus: options.focus ? focusOf(options.focus, ref) : get().focus })
    if (ref && !get().inspectorOpen && typeof window !== 'undefined' && window.innerWidth > 1180) set({ inspectorOpen: true })
  },

  setHover(ref) {
    const prev = get().hover
    if (prev === ref || (prev && ref && refKey(prev) === refKey(ref))) return
    set({ hover: ref })
  },

  requestFocus: (mode, ref = null) => set({ focus: focusOf(mode, ref) }),
  toggleSidebar: (open) => set({ sidebarOpen: open ?? !get().sidebarOpen }),
  toggleInspector: (open) => set({ inspectorOpen: open ?? !get().inspectorOpen }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  toggleTheme() {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    storage.set('theme', theme)
    set({ theme })
  },
  togglePin(viewId) {
    const pinned = get().pinned.includes(viewId) ? get().pinned.filter((v) => v !== viewId) : [...get().pinned, viewId]
    storage.set('pinned', pinned)
    set({ pinned })
  },
  updateViewUi(viewId, patch) {
    set({ viewUi: { ...get().viewUi, [viewId]: { ...get().viewUi[viewId], ...patch } } })
  },
  notify: (notice) => set({ notice }),
}))

export const useDoc = () => useStudio((s) => s.history.present)
export const useIndex = () => indexOf(useDoc())
