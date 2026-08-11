import type { PreloadApi, PreloadAi, PreloadNotebook, PreloadUpdates } from './index'

declare global {
  interface Window {
    api: PreloadApi
    ai: PreloadAi
    notebook: PreloadNotebook
    updates: PreloadUpdates
  }
}

export {}
