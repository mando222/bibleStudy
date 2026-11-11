// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { publishedCopy } from '../src/renderer/src/lib/scriptureSelection'

describe('copying published Scripture with surrounding UI', () => {
  let reader: HTMLElement
  let selection: Selection
  beforeEach(() => {
    document.body.innerHTML =
      '<header>Compare </header><main><h2>Psalm 23 · </h2><p data-scripture-passage><span data-verse="1">' +
      '<span data-scripture-part data-published="The LORD">YHWH</span>' +
      '<span data-scripture-part> is my shepherd. </span></span></p>' +
      '<h2>John 3 · </h2><p data-scripture-passage><span data-verse="16">' +
      '<span data-scripture-part>God </span><span data-scripture-part data-published="loved">ēgapēsen</span>' +
      '<span data-scripture-part> the world. </span></span></p></main><footer>Notes</footer>'
    reader = document.querySelector('main')!
    selection = window.getSelection()!
  })
  afterEach(() => {
    selection.removeAllRanges()
    document.body.replaceChildren()
  })

  it('copies the chosen English substring, the linked phrase for a source-only selection, and a full passage once', () => {
    reader.innerHTML = '<p data-scripture-passage><span data-verse="1"><span data-scripture-part data-published="you will not sin">' +
      '<span data-aligned-english>you will not sin</span> [<bdi>ἁμάρτητε</bdi>]</span><span data-scripture-part>.</span></span></p>'
    const english = reader.querySelector('[data-aligned-english]')!.firstChild!
    const greek = reader.querySelector('bdi')!.firstChild!
    selection.setBaseAndExtent(english, 9, english, 12)
    expect(publishedCopy(reader, selection)).toBe('not')
    selection.setBaseAndExtent(greek, 0, greek, 4)
    expect(publishedCopy(reader, selection)).toBe('you will not sin')
    selection.setBaseAndExtent(english, 9, greek, 4)
    expect(publishedCopy(reader, selection)).toBe('not sin')
    selection.selectAllChildren(document.body)
    expect(publishedCopy(reader, selection)).toBe('Compare you will not sin.Notes')
  })

  it('copies selected headings and both published passages with Select All', () => {
    selection.selectAllChildren(document.body)
    expect(publishedCopy(reader, selection)).toBe('Compare Psalm 23 · The LORD is my shepherd. John 3 · God loved the world. Notes')
    expect(selection.toString()).toContain('YHWH')
  })

  it('preserves the direction and offsets of a backward selection that ends inside a displayed word', () => {
    const heading = reader.querySelector('h2')!.firstChild!
    const changed = reader.querySelector('[data-published]')!.firstChild!
    selection.setBaseAndExtent(changed, 2, heading, 6)
    expect(publishedCopy(reader, selection)).toBe('23 · The LORD')
    expect([selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset])
      .toEqual([changed, 2, heading, 6])
  })

  it('keeps untouched UI copies native when the range only touches the start of a restoration', () => {
    const heading = reader.querySelector('h2')!.firstChild!
    selection.setBaseAndExtent(heading, 0, reader.querySelector('[data-published]')!.firstChild!, 0)
    expect(publishedCopy(reader, selection)).toBeUndefined()
  })

  it('keeps columns separated and excludes UI labels when both endpoints are Scripture', () => {
    const start = reader.querySelector('[data-published]')!.firstChild!
    const end = reader.querySelector('[data-published="loved"]')!.firstChild!
    selection.setBaseAndExtent(start, 1, end, 3)
    expect(publishedCopy(reader, selection)).toBe('The LORD is my shepherd. \nGod loved')
  })
})
