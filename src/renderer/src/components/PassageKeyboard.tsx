import { useId, useRef, type HTMLAttributes, type KeyboardEvent } from 'react'

/** One tab stop for the passage. Arrow keys reach each verse action and linked word in reading order. */
export default function PassageKeyboard({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const hint = useId()
  const end = useRef<HTMLDivElement>(null)
  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return
    const { key } = event
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return
    const target = event.target as HTMLElement
    const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-passage-action]')]
    if (!controls.length) return
    const current = controls.indexOf(target)
    let next = 0
    if (key === 'End') next = controls.length - 1
    else if (key === 'ArrowDown' || key === 'ArrowUp') {
      const verse = target.closest('[data-verse]')
      const markers = controls.filter(el => el.hasAttribute('data-verse-action'))
      const index = markers.findIndex(el => el.closest('[data-verse]') === verse)
      next = controls.indexOf(markers[Math.max(0, Math.min(markers.length - 1, index + (key === 'ArrowDown' ? 1 : -1)))])
    } else if (key !== 'Home') {
      const rtl = props.dir === 'rtl'
      const forward = key === (rtl ? 'ArrowLeft' : 'ArrowRight')
      // Verse jumps focus the verse itself. Start there when the reader next explores its words.
      const verse = target.closest('[data-verse]')
      const local = current < 0 && verse ? controls.filter(el => el.closest('[data-verse]') === verse) : []
      const first = forward ? local[0] : local[local.length - 1]
      next = current < 0 ? Math.max(0, controls.indexOf(first)) : current + (forward ? 1 : -1)
    }
    event.preventDefault()
    controls[Math.max(0, Math.min(controls.length - 1, next))].focus()
  }
  return <>
    <button type="button" className="sr-only focus:not-sr-only focus:text-accent"
      onClick={() => end.current?.focus()}>Skip passage</button>
    <span id={hint} className="sr-only">Use Left and Right to explore words, Up and Down for verse actions, and Enter to open. Tab leaves the passage.</span>
    <div {...props} role="group" aria-describedby={hint} tabIndex={0} onKeyDown={move}>{children}</div>
    <div ref={end} tabIndex={-1} aria-label="End of passage" />
  </>
}
