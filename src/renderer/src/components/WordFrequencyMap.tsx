import { useState } from 'react'
import type { WordFrequencyBook, WordFrequencyCounts } from '@shared/wordFrequency'
import './WordFrequency.css'

export type FrequencyMetric = 'rate' | 'count'

type Scale = { cutoffs: number[]; labels: string[] }
const ranges: Record<FrequencyMetric, Scale> = {
  rate: { cutoffs: [1, 3, 6, 10], labels: ['0', '<1', '1–<3', '3–<6', '6–<10', '10+'] },
  count: { cutoffs: [2, 5, 10, 15], labels: ['0', '1', '2–4', '5–9', '10–14', '15+'] }
}

export function quantity(n: number, unit: string): string {
  return `${n.toLocaleString()} ${unit}${n === 1 ? '' : 's'}`
}

type Tile = {
  id: string | number
  name: string
  label: string
  counts: WordFrequencyCounts
}

function rate({ occurrences, tagged }: WordFrequencyCounts): number {
  return 1000 * occurrences / tagged
}

function valueOf(counts: WordFrequencyCounts, metric: FrequencyMetric): number {
  return metric === 'rate' ? rate(counts) : counts.occurrences
}

/** Keep both grids on one scale. Common words can exceed the default top bin in every book. */
export function frequencyScale(books: WordFrequencyBook[], metric: FrequencyMetric): Scale {
  const standard = ranges[metric]
  const values = (rows: WordFrequencyCounts[]) => rows
    .filter(row => row.tagged && row.occurrences).map(row => valueOf(row, metric))
  const bookValues = values(books)
  const top = standard.cutoffs[standard.cutoffs.length - 1]
  if (!bookValues.length || bookValues.filter(n => n >= top).length <= bookValues.length / 4) return standard

  // Weight books and chapters equally so a large number of chapters does not overwhelm book totals.
  const samples = [bookValues, values(books.flatMap(b => b.chapters))].filter(group => group.length)
  const ordered = samples.flatMap(group => group.map(value => ({ value, weight: 1 / (group.length * samples.length) })))
    .sort((a, b) => a.value - b.value)
  const breaks = new Set<number>()
  let cumulative = 0
  let next = 1
  for (const sample of ordered) {
    cumulative += sample.weight
    while (next < 5 && cumulative >= next / 5) {
      const cutoff = metric === 'count' ? sample.value : Number(sample.value.toFixed(1))
      if (cutoff > ordered[0].value) breaks.add(cutoff)
      next++
    }
  }
  const cutoffs = [...breaks]
  if (!cutoffs.length) return standard
  const labels = ['0']
  for (const [i, cutoff] of cutoffs.entries()) {
    const start = cutoffs[i - 1]
    if (metric === 'rate') labels.push(start ? `${start}–<${cutoff}` : `<${cutoff}`)
    else {
      const first = start ?? 1
      labels.push(first === cutoff - 1 ? String(first) : `${first}–${cutoff - 1}`)
    }
  }
  labels.push(`${cutoffs[cutoffs.length - 1]}+`)
  return { cutoffs, labels }
}

function tone(band: number, scale: Scale): number {
  return band ? 1 + Math.round(4 * (band - 1) / scale.cutoffs.length) : 0
}

function colorLevel(counts: WordFrequencyCounts, metric: FrequencyMetric, scale: Scale): string {
  if (!counts.tagged) return 'unknown'
  if (!counts.occurrences) return '0'
  const value = valueOf(counts, metric)
  return String(tone(1 + scale.cutoffs.filter((threshold) => value >= threshold).length, scale))
}

function description(tile: Tile, denominator: string): string {
  const { occurrences, verses, tagged } = tile.counts
  if (!tagged) return `${tile.name} · No tagged ${denominator} in this scope`
  return `${tile.name} · ${quantity(occurrences, 'occurrence')} in ${quantity(verses, 'verse')} · ${rate(tile.counts).toLocaleString(undefined, { maximumFractionDigits: 2 })} per 1,000 · ${tagged.toLocaleString()} tagged ${denominator}`
}

export function FrequencyLegend({ metric, scale, denominator, hasUncovered }: { metric: FrequencyMetric; scale: Scale; denominator: string; hasUncovered: boolean }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted" aria-label="Color scale">
      <span>{metric === 'rate' ? `Per 1,000 tagged ${denominator}` : 'Occurrences'}</span>
      {scale.labels.map((label, band) => (
        <span className="inline-flex items-center gap-1" key={label}>
          <span className="frequency-color h-2.5 w-2.5 rounded-sm" data-level={tone(band, scale)} aria-hidden="true" />
          {label}
        </span>
      ))}
      {hasUncovered && <span className="inline-flex items-center gap-1">
        <span className="frequency-color h-2.5 w-2.5 rounded-sm" data-level="unknown" aria-hidden="true" />
        — No tagged words
      </span>}
    </div>
  )
}

interface MapProps {
  label: string
  tiles: Tile[]
  active: string | number | undefined
  metric: FrequencyMetric
  scale: Scale
  denominator: string
  onSelect: (tile: Tile) => void
  compact?: boolean
}

export function FrequencyTiles({ label, tiles, active, metric, scale, denominator, onSelect, compact }: MapProps): JSX.Element {
  const [hovered, setHovered] = useState<Tile['id'] | null>(null)
  const [focused, setFocused] = useState<Tile['id'] | null>(null)
  const detail = tiles.find((t) => t.id === (hovered ?? focused ?? active))
  return (
    <>
      <div role="group" aria-label={label} onMouseLeave={() => setHovered(null)}
        className="grid gap-1" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${compact ? '3.5rem' : '4.8rem'}, 1fr))` }}>
        {tiles.map((tile) => {
          const info = description(tile, denominator)
          return (
            <button key={tile.id} type="button" aria-pressed={active === tile.id} aria-label={info} title={info}
              data-level={colorLevel(tile.counts, metric, scale)} className="frequency-color frequency-tile"
              onMouseEnter={() => setHovered(tile.id)} onFocus={() => setFocused(tile.id)} onBlur={() => setFocused(null)}
              onClick={() => onSelect(tile)}>
              <span className="block text-[11px] leading-tight">{tile.label}</span>
              <span className="block font-semibold leading-snug tabular-nums">
                {tile.counts.tagged ? tile.counts.occurrences.toLocaleString() : '—'}
              </span>
            </button>
          )
        })}
      </div>
      {detail && <p className="mt-1.5 text-xs text-muted">{description(detail, denominator)}</p>}
    </>
  )
}
