import { useRef, type ReactNode } from 'react'

/** Keep the mounted tool and its scroll containers when following a link into a different workspace. */
export default function RetainedView({ active, children, className = 'h-full min-h-0' }: {
  active: boolean
  children: ReactNode
  className?: string
}): JSX.Element | null {
  const visited = useRef(false)
  if (active) visited.current = true
  return visited.current ? <div hidden={!active} className={className}>{children}</div> : null
}
