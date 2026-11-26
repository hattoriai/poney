/** The maker's line at the bottom of a sidebar. */
export function MadeBy() {
  return (
    <a
      href="https://hattori.ai"
      target="_blank"
      rel="noopener noreferrer"
      className="sticky bottom-0 mt-auto flex shrink-0 items-center gap-2 bg-paper px-4 pb-4 pt-3 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink"
    >
      <span className="h-px w-3 bg-poney" aria-hidden />
      Made by Hattori AI
    </a>
  )
}
