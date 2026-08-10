import type { SrsCard } from '../../shared/types'

/**
 * SM-2 spaced-repetition scheduling (SuperMemo 2). Pure and dependency-free.
 * `grade` is the user's recall quality 0–5 (0=blackout … 5=perfect). The UI maps its buttons to
 * grades: Again=0, Hard=3, Good=4, Easy=5. Returns the next card state; `now` is epoch millis.
 */
const DAY = 86_400_000

export function schedule(card: SrsCard, grade: number, now: number): SrsCard {
  const g = Math.max(0, Math.min(5, Math.round(grade)))
  let { ease, reps, lapses } = card
  let interval: number

  if (g < 3) {
    // Failed recall: reset the streak, relearn tomorrow.
    reps = 0
    lapses += 1
    interval = 1
  } else {
    reps += 1
    if (reps === 1) interval = 1
    else if (reps === 2) interval = 6
    else interval = Math.round(card.intervalDays * ease)
    if (interval < 1) interval = 1
  }

  // SM-2 ease adjustment, floored at 1.3.
  ease = Math.max(1.3, ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)))

  return {
    strongs: card.strongs,
    language: card.language,
    ease,
    intervalDays: interval,
    dueAt: now + interval * DAY,
    reps,
    lapses,
    lastGrade: g,
    updatedAt: now
  }
}

/** A fresh, never-reviewed card for a lemma. */
export function newCard(strongs: string, language: string): SrsCard {
  return {
    strongs,
    language,
    ease: 2.5,
    intervalDays: 0,
    dueAt: 0,
    reps: 0,
    lapses: 0,
    lastGrade: null,
    updatedAt: 0
  }
}
