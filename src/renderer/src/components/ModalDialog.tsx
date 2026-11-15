import { useLayoutEffect, useRef, type ReactNode } from 'react'

export default function ModalDialog({ label, className, close, children }: {
  label: string
  className: string
  close: () => void
  children: ReactNode
}): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null)
  useLayoutEffect(() => {
    const node = ref.current!
    node.showModal()
    return () => node.close()
  }, [])
  return <dialog ref={ref} aria-label={label}
    className={`m-auto max-h-[85vh] overflow-y-auto bg-panel text-ink border border-line rounded-xl p-0 shadow-xl backdrop:bg-black/40 ${className}`}
    onCancel={event => { event.preventDefault(); close() }}
    onClick={event => { if (event.target === event.currentTarget) close() }}>
    <div>{children}</div>
  </dialog>
}
