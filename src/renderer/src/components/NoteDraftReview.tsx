export default function NoteDraftReview({ saved, review }: { saved: string; review: () => void }) {
  return <div className="rounded border border-line p-2 text-sm" role="group" aria-label="Review saved note">
    <p>This draft differs from the current saved note. Compare them before saving.</p>
    <p dir="auto" className="my-2 whitespace-pre-wrap">{saved}</p>
    <button type="button" onClick={review} className="text-accent">Continue editing my draft</button>
  </div>
}
