import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

/** How long each step shows while playing, and the short wait before the first. */
export const STEP_MS = 1900
export const FIRST_STEP_MS = 60

/**
 * Plays steps in order (the path of a walkthrough scene, the messages of a
 * sequence), with a step back and a step forward. The same controls everywhere.
 */
export function StepPlayer({ count, step, playing, onPlay, onPause, onStep, label = 'Play', compact = false }: { count: number; step: number | null; playing: boolean; onPlay(): void; onPause(): void; onStep(k: number | null): void; label?: string; compact?: boolean }) {
  const btn = 'grid h-7 w-7 place-items-center rounded-md text-ink-2 hover:bg-sunken disabled:opacity-30'
  // In a toolbar: icon buttons, and the step count between them.
  if (compact)
    return (
      <div className="flex items-center" role="group" aria-label={label}>
        <button type="button" className={`${btn} h-8 w-8 hover:text-ink`} aria-label="Previous step" title="Previous step" disabled={step === null || step === 0} onClick={() => onStep((step ?? 0) - 1)}>
          <ChevronLeft size={15} />
        </button>
        <button type="button" className={`${btn} h-8 w-8 hover:text-ink`} aria-label={playing ? 'Pause' : step === null ? label : 'Play'} title={playing ? 'Pause' : step === null ? label : 'Play'} onClick={playing ? onPause : onPlay}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <span className="font-tabular min-w-[54px] text-center text-[12px] text-ink-2" aria-live="polite">
          {step === null ? `${count} steps` : `${step + 1} / ${count}`}
        </span>
        <button type="button" className={`${btn} h-8 w-8 hover:text-ink`} aria-label="Next step" title="Next step" disabled={step !== null && step >= count - 1} onClick={() => onStep(step === null ? 0 : step + 1)}>
          <ChevronRight size={15} />
        </button>
      </div>
    )
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-rule bg-sunken/60 p-0.5" role="group" aria-label={label}>
      <button type="button" className={btn} aria-label="Previous step" disabled={step === null || step === 0} onClick={() => onStep((step ?? 0) - 1)}>
        <ChevronLeft size={15} />
      </button>
      {playing ? (
        <button type="button" onClick={onPause} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-raised px-2.5 text-[12.5px] font-semibold text-ink shadow-[0_1px_2px_#0000001a]">
          <Pause size={13} /> Pause
        </button>
      ) : (
        <button type="button" onClick={onPlay} className="inline-flex h-7 items-center gap-1.5 rounded-md bg-raised px-2.5 text-[12.5px] font-semibold text-ink shadow-[0_1px_2px_#0000001a]">
          <Play size={13} /> {step === null ? label : step >= count - 1 ? 'Again' : 'Play'}
        </button>
      )}
      <button type="button" className={btn} aria-label="Next step" disabled={step !== null && step >= count - 1} onClick={() => onStep(step === null ? 0 : step + 1)}>
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
