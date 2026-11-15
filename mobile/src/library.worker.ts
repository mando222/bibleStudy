import { bundledLibrary } from './bundledLibrary'
import { connectCorpus } from './corpusDb'

self.onmessage = async ({ data }) => {
  const { id, method, args } = data
  try {
    if (method === 'connect') {
      connectCorpus(args[0])
      self.postMessage({ id, value: true })
      return
    }
    if (!Object.hasOwn(bundledLibrary, method)) throw new Error('Unknown study tool.')
    const run = bundledLibrary[method as keyof typeof bundledLibrary] as (...args: unknown[]) => unknown
    const value = await run(...args)
    self.postMessage({ id, value })
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) })
  }
}
