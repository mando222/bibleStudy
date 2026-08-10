import { describe, it, expect } from 'vitest'
import { schedule, newCard } from '../src/main/db/srs'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

describe('SRS (SM-2) scheduling', () => {
  it('a new card starts unreviewed with default ease', () => {
    const c = newCard('G26', 'greek')
    expect(c.reps).toBe(0)
    expect(c.ease).toBe(2.5)
    expect(c.dueAt).toBe(0)
    expect(c.lapses).toBe(0)
  })

  it('a good first review schedules 1 day out and raises reps', () => {
    const c = schedule(newCard('G26', 'greek'), 4, NOW)
    expect(c.reps).toBe(1)
    expect(c.intervalDays).toBe(1)
    expect(c.dueAt).toBe(NOW + 1 * DAY)
    expect(c.lastGrade).toBe(4)
  })

  it('intervals grow 1 → 6 → interval*ease across successive good reviews', () => {
    let c = schedule(newCard('G26', 'greek'), 4, NOW)
    expect(c.intervalDays).toBe(1)
    c = schedule(c, 4, NOW)
    expect(c.intervalDays).toBe(6)
    c = schedule(c, 4, NOW)
    expect(c.intervalDays).toBe(Math.round(6 * c.ease))
    expect(c.intervalDays).toBeGreaterThan(6)
  })

  it('a failed review (grade < 3) resets the streak, counts a lapse, and relearns tomorrow', () => {
    let c = schedule(newCard('G26', 'greek'), 5, NOW) // learn it
    c = schedule(c, 5, NOW) // reps=2, interval 6
    const failed = schedule(c, 0, NOW)
    expect(failed.reps).toBe(0)
    expect(failed.intervalDays).toBe(1)
    expect(failed.lapses).toBe(1)
    expect(failed.dueAt).toBe(NOW + DAY)
  })

  it('ease never drops below the 1.3 floor no matter how many failures', () => {
    let c = newCard('G26', 'greek')
    for (let i = 0; i < 12; i++) c = schedule(c, 0, NOW)
    expect(c.ease).toBeGreaterThanOrEqual(1.3)
  })
})
