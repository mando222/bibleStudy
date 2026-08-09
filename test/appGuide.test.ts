import { describe, it, expect } from 'vitest'
import { retrieveGuide } from '../src/main/ai/appGuide'

describe('retrieveGuide', () => {
  it('answers app how-to questions with the right section', () => {
    expect(retrieveGuide("How do I turn on Strong's numbers?")[0]?.text).toMatch(/Strong/i)
    expect(retrieveGuide('how do I see the greek of this verse')[0]?.text).toMatch(/interlinear/i)
    expect(retrieveGuide('how can I highlight a verse and add a note')[0]?.text).toMatch(
      /highlight/i
    )
    expect(retrieveGuide('make LORD say Yahweh')[0]?.text).toMatch(/divine|yahweh/i)
  })

  it('tags results as the App guide source', () => {
    const r = retrieveGuide('how do I import the NKJV')
    expect(r.length).toBeGreaterThan(0)
    expect(r[0].source).toBe('App guide')
  })

  it('stays out of ordinary Bible questions', () => {
    expect(retrieveGuide('For God so loved the world')).toHaveLength(0)
    expect(retrieveGuide('who was Melchizedek')).toHaveLength(0)
    expect(retrieveGuide('what does agape mean')).not.toBeNull()
  })
})
