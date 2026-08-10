import type { PreloadApi, PreloadAi, PreloadNotebook } from './index'

declare global {
  interface Window {
    api: PreloadApi
    ai: PreloadAi
    notebook: PreloadNotebook
  }
}

export {}
