import { useState } from 'react'

export default function DeleteVerseNote({ disabled, onDelete }: {
  disabled: boolean
  onDelete: () => Promise<void>
}): JSX.Element {
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <div role="group" aria-label="Confirm deletion" className="flex flex-wrap items-center gap-2 py-1 text-sm">
      <span>Delete this verse note?</span>
      <button type="button" disabled={disabled} onClick={() => setConfirming(false)} className="text-accent">Keep note</button>
      <button type="button" disabled={disabled} onClick={onDelete} className="text-muted hover:text-red-500">Confirm delete</button>
    </div>
  ) : (
    <button type="button" disabled={disabled} onClick={() => setConfirming(true)} className="text-muted hover:text-red-500">Delete note</button>
  )
}
