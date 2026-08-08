import { useAppStore } from '@/store/useAppStore'

/** Renders text, turning Strong's references (G#### / H####) into clickable
 *  links that load that lexicon entry — for walking derivations/roots. */
export default function StrongsText({ text }: { text: string }): JSX.Element {
  const selectStrongs = useAppStore((s) => s.selectStrongs)
  const parts = text.split(/\b([GH]\d{1,5})\b/g)
  return (
    <>
      {parts.map((p, i) =>
        /^[GH]\d{1,5}$/.test(p) ? (
          <button
            key={i}
            onClick={() => selectStrongs(p)}
            className="text-accent hover:underline font-medium"
          >
            {p}
          </button>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}
