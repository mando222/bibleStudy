import type { bundledLibrary } from './bundledLibrary'

type AsyncLibrary = {
  [K in keyof typeof bundledLibrary]: (
    ...args: Parameters<(typeof bundledLibrary)[K]>
  ) => Promise<Awaited<ReturnType<(typeof bundledLibrary)[K]>>>
}

let worker: Worker | undefined
let sequence = 0
const requests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()

function invoke(method: string, args: unknown[]) {
  if (!worker) return Promise.reject(new Error('The offline library has not opened.'))
  const id = ++sequence
  return new Promise<unknown>((resolve, reject) => {
    requests.set(id, { resolve, reject })
    try {
      worker!.postMessage({ id, method, args })
    } catch (error) {
      requests.delete(id)
      reject(error)
    }
  })
}

export async function startLibraryWorker(key: string) {
  worker?.terminate()
  worker = new Worker(new URL('./library.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = ({ data }) => {
    const pending = requests.get(data.id)
    if (!pending) return
    requests.delete(data.id)
    if (data.error) pending.reject(new Error(data.error))
    else pending.resolve(data.value)
  }
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The offline study worker could not start.')
    worker?.terminate()
    worker = undefined
    for (const pending of requests.values()) pending.reject(error)
    requests.clear()
  }
  await invoke('connect', [key])
}

export const bundledQueries = new Proxy({} as AsyncLibrary, {
  get:
    (_, method: string) =>
    (...args: unknown[]) =>
      invoke(method, args)
})
