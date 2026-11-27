import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Poney's diagram styles first; the Studio's own (Tailwind) after.
import '@hattoriai/poney-diagrams/styles.css'
import './app/styles.css'
import { registerStudioExtension } from './features/extensions'
import { ownershipStudio } from './extensions/ownership'
import { securityStudio } from './extensions/security'
import { useStudio } from './features/store'
import { App } from './app/App'
import { START_HASH, StartPage } from './app/StartPage'
import { AgentPanel } from './components/agent/AgentPanel'
import { ConnectDialog } from './components/agent/ConnectDialog'
import { OpenFileDialog } from './components/dialogs/OpenFileDialog'
import { OpenProjectDialog } from './components/dialogs/OpenProjectDialog'
import { DeleteFileDialog } from './components/dialogs/DeleteFileDialog'
import { StudioRender } from './story/StudioRender'
import { ImportCodeDialog } from './components/dialogs/ImportCodeDialog'
import { RenameField } from './components/canvas/RenameField'
import { ContextMenu } from './components/canvas/ContextMenu'
import { PointingHint } from './components/agent/PointingHint'
import { SelectionBubble } from './components/agent/SelectionBubble'
import { installTextMenu } from './features/context'
import { readLocation } from './features/location'
import { installLive } from './features/live'
import { openExample, restoreLast, trackRecent } from './features/recent'

registerStudioExtension(ownershipStudio)
registerStudioExtension(securityStudio)

/** Nothing opens by itself: a new tab shows the start page. A reload keeps this tab's document; ?example=kestrel opens the example. */
async function start() {
  if (new URLSearchParams(window.location.search).get('example') === 'kestrel') await openExample()
  else restoreLast()
  const s = useStudio.getState()
  // Nothing open: the start page, whatever view an old address names.
  if (!s.history && window.location.hash !== START_HASH) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${START_HASH}`)
  if (window.location.hash === START_HASH) s.showStart(true)
  else if (s.history) {
    if (s.viewId.startsWith('walk:') && window.innerWidth < 1700) s.toggleSidebar(false)
    readLocation()
  }
  trackRecent()
  installLive()
  installTextMenu()
}

/** The page, and what every page shares: the agent panel and the dialog that connects an agent. */
function Root() {
  const start = useStudio((s) => !s.history || s.startOpen)
  return (
    <>
      {start ? (
        <StartPage />
      ) : (
        <StudioRender>
          <App />
        </StudioRender>
      )}
      <AgentPanel />
      <ConnectDialog />
      <OpenFileDialog />
      <OpenProjectDialog />
      <DeleteFileDialog />
      <ImportCodeDialog />
      <RenameField />
      <ContextMenu />
      <PointingHint />
      <SelectionBubble />
    </>
  )
}

declare global {
  interface Window {
    __poneyStarted?: boolean
  }
}

// The start-up code (the store, the live link) runs once per page. A hot update in development may run this
// file again; that would make a second React root and a second live connection, so the page reloads instead.
if (window.__poneyStarted) window.location.reload()
else {
  window.__poneyStarted = true
  void start().finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Root />
      </StrictMode>,
    ),
  )
}
