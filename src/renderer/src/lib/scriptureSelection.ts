/** The selected portion of one displayed span, including partial word endpoints. */
function overlapOf(span: HTMLElement, range: Range): Range {
  const overlap = document.createRange()
  overlap.selectNodeContents(span)
  if (overlap.compareBoundaryPoints(Range.START_TO_START, range) < 0) {
    overlap.setStart(range.startContainer, range.startOffset)
  }
  if (overlap.compareBoundaryPoints(Range.END_TO_END, range) > 0) {
    overlap.setEnd(range.endContainer, range.endOffset)
  }
  return overlap
}

function publishedFragment(span: HTMLElement, overlap: Range): string {
  const displayed = overlap.toString()
  if (!displayed || span.dataset.published === undefined) return displayed
  const printed = span.querySelector<HTMLElement>('[data-aligned-english]')
  if (printed && overlap.intersectsNode(printed)) {
    const selected = overlapOf(printed, overlap).toString()
    if (selected) return selected
  }
  // Selecting only the added source form cites its whole aligned phrase.
  return span.dataset.alignedPhrase ?? span.dataset.published
}

/** Extract the published text covered by a DOM range in one edition's reading column.
 * A partial selection of a transliteration denotes its entire aligned English span.
 * Unchanged text keeps the precise character offsets the reader selected.
 */
export function publishedSelection(container: HTMLElement, range: Range) {
  const verses: { verse: number; text: string }[] = []
  for (const row of container.querySelectorAll<HTMLElement>('[data-verse]')) {
    if (!range.intersectsNode(row)) continue
    let text = ''
    for (const span of row.querySelectorAll<HTMLElement>('[data-scripture-part]')) {
      if (!range.intersectsNode(span)) continue
      text += publishedFragment(span, overlapOf(span, range))
    }
    if (text) verses.push({ verse: Number(row.dataset.verse), text })
  }
  if (!verses.length) return null
  return { text: verses.map(v => v.text).join(' '), v1: verses[0].verse, v2: verses[verses.length - 1].verse }
}

/** A selection can extend beyond the reader (including Select All). Keep headings and other
 * selected UI text. Chromium's Selection string preserves rendered line breaks and spacing. */
export function publishedCopy(reader: HTMLElement, selection: Selection): string | undefined {
  if (!selection.rangeCount || selection.isCollapsed) return
  const range = selection.getRangeAt(0)
  const passageOf = (node: Node) => (node instanceof Element ? node : node.parentElement)
    ?.closest<HTMLElement>('[data-scripture-passage]')
  // An unnumbered heading or psalm superscription can be copied by itself as printed.
  const titleOf = (node: Node) => (node instanceof Element ? node : node.parentElement)
    ?.closest('[data-literary-kind="heading"], [data-literary-kind="superscription"]')
  const startTitle = titleOf(range.startContainer)
  if (startTitle && startTitle === titleOf(range.endContainer)) return
  const start = passageOf(range.startContainer)
  const end = passageOf(range.endContainer)
  if (start && end && reader.contains(start) && reader.contains(end)) {
    const passages = start === end ? [start] : [...reader.querySelectorAll<HTMLElement>('[data-scripture-passage]')]
    return passages.filter(p => range.intersectsNode(p)).map(p => publishedSelection(p, range)?.text).filter(Boolean).join('\n')
  }

  const changes = [...reader.querySelectorAll<HTMLElement>('[data-scripture-part][data-published]')]
    .filter(span => range.intersectsNode(span))
    .map(span => {
      const overlap = overlapOf(span, range)
      return { overlap, published: publishedFragment(span, overlap) }
    })
    .filter(({ overlap }) => overlap.toString().length > 0)
  if (!changes.length || !selection.anchorNode || !selection.focusNode) return

  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection
  const remaining = range.cloneRange()
  const parts: string[] = []
  function renderedText(part: Range): string {
    if (part.collapsed) return ''
    selection.removeAllRanges()
    selection.addRange(part)
    return selection.toString()
  }
  try {
    for (const { overlap, published } of changes) {
      const before = remaining.cloneRange()
      before.setEnd(overlap.startContainer, overlap.startOffset)
      parts.push(renderedText(before), published)
      remaining.setStart(overlap.endContainer, overlap.endOffset)
    }
    parts.push(renderedText(remaining))
    return parts.join('')
  } finally {
    selection.setBaseAndExtent(anchorNode, anchorOffset, focusNode, focusOffset)
  }
}
