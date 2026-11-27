import { Check, FilePlus2, FileText, Folder, FolderPlus, Plus, Save, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStudio, type OpenWorkspace } from '@/features/store'
import { openFile, removeDocument, removeFolder } from '@/features/agent'

/**
 * The open workspace, as an editor's explorer shows it: its documents and its
 * folders, each section with a + to add one. In the sidebar when a document
 * is open, and large on the start page. A document opened alone shows only
 * its folders, so a folder can be added to it.
 */
export function WorkspacePanel({ variant = 'sidebar' }: { variant?: 'sidebar' | 'page' }) {
  const live = useStudio((s) => s.live.state === 'on')
  const workspace = useStudio((s) => s.workspace)
  const { documents, shown } = useStudio((s) => s.folderDocuments)
  const liveFile = useStudio((s) => s.liveFile)
  if (!live || (!workspace && !liveFile)) return null
  const page = variant === 'page'
  const alone = !workspace || workspace.key.startsWith('document:')
  const lists = !!workspace && (!!workspace.file || workspace.key.startsWith('untitled:'))
  const folders = workspace?.folders ?? []
  // A folder opened alone is the workspace itself; a saved workspace keeps one folder; an untitled one, or a document's, can lose any.
  const canRemoveFolder = alone || !!workspace?.key.startsWith('untitled:') || (!!workspace?.file && folders.length > 1)
  const fail = (e: unknown) => useStudio.getState().notify(e instanceof Error ? e.message.split('\n')[0] : String(e))
  const item = page ? 'py-2 pl-3 text-[15px]' : 'py-1.5 pl-2 text-[13.5px]'

  const foldersSection = (
    <Section
          page={page}
          title="Folders"
          add={{ label: 'Add a folder', run: () => useStudio.getState().setWorkspaceDialog('add-folder') }}
        >
          {folders.length === 0 ? (
            <Empty page={page}>{workspace ? 'Add the folders with the code. The agent reads them.' : 'Add the folder with the code, so an agent can read it.'}</Empty>
          ) : (
            folders.map((f) => (
              <Row
                key={f.path}
                page={page}
                icon={<Folder size={page ? 16 : 14} className="shrink-0 text-ink-3" />}
                label={f.name}
                detail={f.missing ? 'Missing' : page ? f.path : undefined}
                disabled={f.missing}
                title={f.path}
                remove={canRemoveFolder ? { label: `Remove the folder ${f.name} from the workspace. The folder stays.`, run: () => void removeFolder(f.path).catch(fail) } : undefined}
                className={item}
              />
            ))
          )}
        </Section>
  )

  return (
    <section aria-label="Workspace" className={page ? '' : 'border-b border-rule px-2 pb-2'}>
      {workspace && (
        <div className={`flex items-center gap-2 ${page ? 'mb-6' : 'px-2 pb-1 pt-2'}`}>
          <span className="min-w-0 flex-1">
            <span className={`block truncate font-semibold ${page ? 'text-[28px] tracking-[-0.02em]' : 'text-[12px] uppercase tracking-wide text-ink-3'}`}>{workspace.name}</span>
            {page && <span className="mt-1 block truncate text-[13.5px] text-ink-3">{workspace.file ?? (workspace.key.startsWith('untitled:') ? 'Not saved. Save it to commit it and share it.' : folders.length ? folders[0].path : '')}</span>}
          </span>
          {!workspace.file && folders.length > 0 && (
            <button
              type="button"
              title="Save as a .poney-workspace file, to commit it and share it"
              onClick={() => useStudio.getState().setWorkspaceDialog('save')}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-md text-ink-2 hover:bg-sunken hover:text-ink ${page ? 'h-8 border border-rule px-3 text-[13px] font-medium' : 'h-6 px-1.5 text-[12px]'}`}
            >
              <Save size={page ? 14 : 12} /> Save as…
            </button>
          )}
        </div>
      )}

      {page && foldersSection}
      {!alone && (
        <Section
          page={page}
          title="Documents"
          add={{
            label: 'New document',
            disabled: !folders.length,
            hint: folders.length ? undefined : 'Add a folder first: a new document is saved in its docs/poney/.',
            run: () => useStudio.getState().setNewDocumentOpen(true),
          }}
        >
          {documents.length === 0 ? (
            <Empty page={page}>{folders.length ? 'No documents yet. Make one, or ask the agent for one.' : 'Add a folder first. Then make a document, or ask the agent for one.'}</Empty>
          ) : (
            documents.map((d) => (
              <Row
                key={d.path}
                page={page}
                icon={<FileText size={page ? 16 : 14} className="shrink-0 text-ink-3" />}
                label={d.name}
                detail={d.invalid ?? (folders.length > 1 ? folderName(workspace!, d.path) : undefined)}
                disabled={!!d.invalid}
                current={d.path === shown}
                title={d.invalid ?? d.path}
                open={() => (d.path === shown ? useStudio.getState().showStart(false) : void openFile(d.path).catch(fail))}
                remove={lists ? { label: `Remove ${d.name} from the workspace. The file stays.`, run: () => void removeDocument(d.path).catch(fail) } : undefined}
                className={item}
              />
            ))
          )}
        </Section>
      )}

      {!page && foldersSection}
    </section>
  )
}

function Section({ page, title, add, children }: { page: boolean; title: string; add: { label: string; run(): void; disabled?: boolean; hint?: string }; children: ReactNode }) {
  return (
    <div className={page ? 'mb-8' : 'mt-1'}>
      <div className={`flex items-center ${page ? 'mb-2 border-b border-rule pb-2' : 'px-2 py-0.5'}`}>
        <h3 className={`flex-1 font-medium text-ink-3 ${page ? 'text-[13px]' : 'text-[11.5px]'}`}>{title}</h3>
        <button
          type="button"
          aria-label={add.label}
          title={add.hint ?? add.label}
          disabled={add.disabled}
          onClick={add.run}
          className={`inline-flex items-center gap-1 rounded-md text-ink-2 hover:bg-sunken hover:text-ink disabled:opacity-35 ${page ? 'h-8 px-2.5 text-[13px] font-medium' : 'h-6 w-6 justify-center'}`}
        >
          {title === 'Folders' ? <FolderPlus size={page ? 15 : 14} /> : page ? <FilePlus2 size={15} /> : <Plus size={14} />}
          {page && add.label}
        </button>
      </div>
      <div>{children}</div>
    </div>
  )
}

function Empty({ page, children }: { page: boolean; children: ReactNode }) {
  return <p className={`text-ink-3 ${page ? 'px-3 py-2 text-[14px]' : 'px-2 py-1 text-[12.5px]'}`}>{children}</p>
}

function Row({
  page,
  icon,
  label,
  detail,
  disabled,
  current,
  title,
  open,
  remove,
  className,
}: {
  page: boolean
  icon: ReactNode
  label: string
  detail?: string
  disabled?: boolean
  current?: boolean
  title?: string
  open?(): void
  remove?: { label: string; run(): void }
  className: string
}) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {detail && <span className={`block truncate text-ink-3 ${page ? 'text-[12.5px]' : 'text-[11.5px]'}`}>{detail}</span>}
      </span>
      {current && <Check size={14} className={`shrink-0 text-poney ${remove ? 'group-hover:invisible' : ''}`} />}
    </>
  )
  const box = `flex w-full items-center gap-2 rounded-md text-left ${remove ? 'pr-8' : 'pr-2'} ${className} ${disabled ? 'opacity-50' : ''} ${current ? 'bg-sunken' : ''}`
  return (
    <div className="group relative">
      {open ? (
        <button type="button" disabled={disabled} title={title} onClick={open} className={`${box} hover:bg-sunken`}>
          {body}
        </button>
      ) : (
        <div title={title} className={box}>
          {body}
        </div>
      )}
      {remove && (
        <button
          type="button"
          aria-label={remove.label}
          title={remove.label}
          onClick={remove.run}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-ink-4 opacity-0 hover:bg-raised hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

/** The workspace folder a document is in, for a workspace with several folders. */
function folderName(w: OpenWorkspace, path: string): string {
  return w.folders.find((f) => path.startsWith(`${f.path}/`))?.name ?? path.slice(0, path.lastIndexOf('/'))
}
