import type { PreloadApi, PreloadAi } from './index'

declare global {
  interface Window {
    api: PreloadApi
    ai: PreloadAi
  }
}

export {}
