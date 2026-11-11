/** Padded references like H0430 and H430 are the same numeric entry. */
export function lexiconId(input: string): string {
  const id = input.trim().toUpperCase()
  return id.replace(/^([GH])0+(\d+)$/, '$1$2')
}
