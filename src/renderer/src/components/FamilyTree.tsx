import type { PersonDetail, PersonRef } from '@shared/types'
import { useAppStore } from '@/store/useAppStore'

/** A 3-generation family tree as points: parents → person (+ spouses) → children, all clickable. */
export default function FamilyTree({ person }: { person: PersonDetail }): JSX.Element {
  const focusPerson = useAppStore((s) => s.focusPerson)

  const spacing = 120
  const kids = person.children
  const spouses = person.spouses
  const kidSpan = Math.max(kids.length - 1, 0) * spacing
  const cx = Math.max(160, 80 + kidSpan / 2)
  const kidX = (i: number): number => cx - kidSpan / 2 + i * spacing
  const spouseX = (i: number): number => cx + 130 + i * 130
  const W = Math.max(cx + kidSpan / 2 + 90, spouseX(spouses.length - 1) + 80, 480)
  const H = 300
  const yP = 52
  const yS = 150
  const yK = 250

  const node = (p: PersonRef, nx: number, ny: number, self = false): JSX.Element => (
    <g
      key={`${nx}-${ny}-${p.id}`}
      className="cursor-pointer"
      onClick={() => (self ? undefined : focusPerson(p.id))}
    >
      <circle
        cx={nx}
        cy={ny}
        r={self ? 7 : 5}
        className={self ? 'fill-accent' : 'fill-accent/50 hover:fill-accent'}
      />
      <text
        x={nx}
        y={ny === yP ? ny - 12 : ny + 18}
        textAnchor="middle"
        className="fill-ink text-[11px]"
      >
        {p.name}
      </text>
    </g>
  )

  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-elevated/30 py-2">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="max-w-none">
        {person.father && (
          <line x1={cx - 70} y1={yP} x2={cx} y2={yS} className="stroke-line" strokeWidth={1} />
        )}
        {person.mother && (
          <line x1={cx + 70} y1={yP} x2={cx} y2={yS} className="stroke-line" strokeWidth={1} />
        )}
        {spouses.map((s, i) => (
          <line
            key={`sl${s.id}`}
            x1={cx}
            y1={yS}
            x2={spouseX(i)}
            y2={yS}
            className="stroke-line/70"
            strokeDasharray="3 3"
          />
        ))}
        {kids.map((k, i) => (
          <line key={`kl${k.id}`} x1={cx} y1={yS} x2={kidX(i)} y2={yK} className="stroke-line" strokeWidth={1} />
        ))}

        {person.father && node(person.father, cx - 70, yP)}
        {person.mother && node(person.mother, cx + 70, yP)}
        {spouses.map((s, i) => node(s, spouseX(i), yS))}
        {node({ id: person.id, name: person.name }, cx, yS, true)}
        {kids.map((k, i) => node(k, kidX(i), yK))}
      </svg>
    </div>
  )
}
