import { familyName } from '@shared/familyEvidence'
import type { PersonDetail } from '@shared/types'
import { ChildrenByParent, PersonLinks } from './FamilyRelations'

/** An expandable-width family tree built from the recorded relationships of each child. */
export default function FamilyTree({ person, onPick }: { person: PersonDetail; onPick: (id: number) => void }): JSX.Element {
  const parents = [
    { label: person.id === 905 ? 'Father in the genealogy' : 'Father', ref: person.father },
    { label: 'Mother', ref: person.mother }
  ]
  return (
    <section aria-label="Family tree" className="rounded-lg border border-line bg-elevated/30 p-3">
      <div className="flex flex-wrap gap-2">
        {parents.map(({ label, ref }) => ref && <div key={label} className="rounded-md border border-line px-3 py-1">
          <div className="text-xs text-muted">{label}</div><PersonLinks people={[ref]} onPick={onPick} />
        </div>)}
      </div>
      <div className="ms-3">
        {parents.some(p => p.ref) && <div className="h-3 border-s border-line" />}
        <div className="rounded-md border border-accent/50 px-3 py-2">
          <span className="font-serif text-lg text-ink">{familyName(person)}</span>
          {person.spouses.length > 0 && <div className="mt-1">
            <span className="text-xs text-muted">Spouses</span><PersonLinks people={person.spouses} onPick={onPick} />
          </div>}
        </div>
        <div className="border-s border-line ps-3"><ChildrenByParent person={person} onPick={onPick} tree /></div>
      </div>
    </section>
  )
}
