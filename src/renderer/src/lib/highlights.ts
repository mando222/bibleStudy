import type { HighlightColor } from '@shared/types'

export const HIGHLIGHT_COLORS: HighlightColor[] = ['yellow', 'green', 'blue', 'pink', 'orange']

/** CSS color for a highlight, referencing the theme's --hl-* variables. */
export const highlightVar = (c: HighlightColor): string => `rgb(var(--hl-${c}))`
