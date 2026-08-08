/** Renders text with {{…}} match markers as highlighted spans. */
export default function Snippet({ text }: { text: string }): JSX.Element {
  const parts = text.split(/\{\{|\}\}/)
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-accent-soft text-accent rounded px-0.5">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
