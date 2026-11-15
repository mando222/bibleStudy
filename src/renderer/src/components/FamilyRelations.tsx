import { familyName } from '@shared/familyEvidence'
import type { FamilyChild, FamilySibling, PersonDetail, PersonRef, SiblingRelation } from '@shared/types'
import VerseRefs from './VerseRefs'

type Pick = (id: number) => void

export function PersonLinks({ people, onPick }: { people: PersonRef[]; onPick: Pick }): JSX.Element {
  return (
    <ul className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      {people.map(p => <li key={p.id}><button className="text-sm text-accent hover:underline" onClick={() => onPick(p.id)}>{familyName(p)}</button></li>)}
    </ul>
  )
}

const siblingLabels: Record<SiblingRelation, string> = {
  both: 'Both parents in common', halfFather: 'Half-siblings · same father', halfMother: 'Half-siblings · same mother',
  father: 'Father in common · mothers incompletely recorded', mother: 'Mother in common · fathers incompletely recorded',
  recorded: 'Shared parent unspecified'
}

export function SiblingList({ people, onPick }: { people: FamilySibling[]; onPick: Pick }): JSX.Element {
  return (
    <section className="mt-4 border-t border-line/60 pt-3">
      <h3 className="text-sm font-semibold text-ink">Siblings</h3>
      {people.length ? (Object.keys(siblingLabels) as SiblingRelation[]).map(key => {
        const members = people.filter(p => p.relation === key)
        return members.length > 0 && <div key={key} className="mt-2">
          <h4 className="text-xs text-muted">{siblingLabels[key]}</h4>
          <PersonLinks people={members} onPick={onPick} />
        </div>
      }) : <p className="text-sm text-muted">No siblings recorded.</p>}
    </section>
  )
}

export function ChildrenByParent({ person, onPick, tree = false }: {
  person: PersonDetail; onPick: Pick; tree?: boolean
}): JSX.Element {
  const groups = new Map<string, { role: string; parent: PersonRef | null; children: FamilyChild[] }>()
  for (const child of person.children) {
    const showFather = child.mother?.id === person.id
    const role = showFather ? (child.id === 905 ? 'Father in the genealogy' : 'Father') : 'Mother'
    const parent = showFather ? child.father : child.mother
    const key = role + '/' + (parent?.id ?? '')
    const group = groups.get(key) ?? { role, parent, children: [] }
    group.children.push(child)
    groups.set(key, group)
  }
  const ordered = [...groups.values()].sort((a, b) => a.parent && b.parent
    ? a.parent.name.localeCompare(b.parent.name) : Number(!a.parent) - Number(!b.parent))
  return (
    <section aria-label="Children" className="mt-3">
      <h3 className="text-sm font-semibold text-ink">Children</h3>
      {person.children.length ? <ul className={tree ? 'ms-3 border-s border-line' : 'grid gap-x-4 gap-y-2 sm:grid-cols-2'}>
        {ordered.map(({ role, parent, children }) => {
          const refs = [...new Set(children.flatMap(child => child.motherRefs))]
          return <li key={role + '/' + parent?.id} className={tree ? 'relative ms-3 mt-2 rounded border border-line px-3 py-2 before:absolute before:top-4 before:-left-3 before:w-3 before:border-t before:border-line' : 'mt-1'}>
            <div className="flex flex-wrap items-baseline gap-x-1 text-xs text-muted">
              {parent ? <>{role} · <button className="text-accent hover:underline" onClick={() => onPick(parent.id)}>{familyName(parent)}</button></> :
                <span>{role} unrecorded</span>}
            </div>
            <PersonLinks people={children} onPick={onPick} />
            {refs.length > 0 && <VerseRefs refs={refs} followReader />}
          </li>
        })}
      </ul> : <p className="text-sm text-muted">No children recorded.</p>}
    </section>
  )
}
