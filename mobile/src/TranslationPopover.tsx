import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type Props = {
  id: string
  anchor: HTMLElement
  onClose: () => void
  children: ReactNode
}

type Placement = CSSProperties & { '--popover-arrow-left': string }

/** A nonmodal picker: the toolbar button remains available to toggle it closed. */
export function TranslationPopover({ id, anchor, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  const [placement, setPlacement] = useState<Placement>()

  useLayoutEffect(() => {
    const node = panel.current
    if (!node) return
    const viewport = window.visualViewport
    let dismissed = false
    let restoreFocus = true
    const place = () => {
      const rect = anchor.getBoundingClientRect()
      const x = viewport?.offsetLeft ?? 0
      const y = viewport?.offsetTop ?? 0
      const viewportWidth = viewport?.width ?? window.innerWidth
      const viewportHeight = viewport?.height ?? window.innerHeight
      const width = Math.min(440, Math.max(0, viewportWidth - 16))
      const left = Math.max(x + 8, Math.min(rect.left, x + viewportWidth - width - 8))
      const top = Math.min(Math.max(y + 8, rect.bottom + 8), y + viewportHeight - 8)
      const arrow = Math.max(16, Math.min(rect.left + rect.width / 2 - left, width - 16))
      setPlacement({ top, left, width, maxHeight: Math.max(0, y + viewportHeight - top - 8),
        '--popover-arrow-left': `${arrow}px` })
    }
    const dismiss = (restore: boolean) => {
      if (dismissed) return
      dismissed = true
      restoreFocus = restore
      close.current()
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !node.contains(target) && !anchor.contains(target)) dismiss(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (target instanceof Node && !node.contains(target) && !anchor.contains(target)) dismiss(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      event.stopPropagation()
      dismiss(true)
    }
    place()
    const initialFocus = node.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)')
      ?? node.querySelector<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')
    const focusTarget = initialFocus ?? node
    focusTarget.focus({ preventScroll: true })
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place)
    observer?.observe(anchor)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    viewport?.addEventListener('resize', place)
    viewport?.addEventListener('scroll', place)
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      viewport?.removeEventListener('resize', place)
      viewport?.removeEventListener('scroll', place)
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('keydown', onKeyDown, true)
      const focused = document.activeElement
      if (restoreFocus && anchor.isConnected && (node.contains(focused) || focused === document.body)) {
        anchor.focus({ preventScroll: true })
      }
    }
  }, [anchor])

  return <div ref={panel} id={id} className="translation-popover" role="dialog"
    aria-label="Translations" aria-modal={false} tabIndex={-1}
    style={placement}>
    <div className="translation-popover-content">{children}</div>
  </div>
}
