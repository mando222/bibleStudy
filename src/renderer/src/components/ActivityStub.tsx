import type { SVGProps } from 'react'

/** Placeholder for an activity we've scaffolded but not built yet (Genealogies/Timelines/Maps). */
export default function ActivityStub({
  Icon,
  title,
  blurb,
  sources
}: {
  Icon: (p: SVGProps<SVGSVGElement>) => JSX.Element
  title: string
  blurb: string
  sources?: string
}): JSX.Element {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-8 bg-bg">
      <div className="w-16 h-16 rounded-2xl bg-accent-soft text-accent flex items-center justify-center mb-4">
        <Icon className="w-8 h-8" />
      </div>
      <h2 className="text-2xl font-serif text-ink mb-1">{title}</h2>
      <span className="text-[11px] uppercase tracking-wider text-faint mb-4">Coming soon</span>
      <p className="max-w-md text-sm text-muted leading-relaxed">{blurb}</p>
      {sources && (
        <p className="mt-4 max-w-md text-xs text-faint leading-relaxed">
          <span className="uppercase tracking-wider">Planned data</span> · {sources}
        </p>
      )}
    </div>
  )
}
