import type { BibleApi, NotebookApi, AiApi, UpdatesApi } from '@shared/types'

declare global {
  interface Window {
    api: BibleApi
    notebook: NotebookApi
    ai: AiApi
    updates: UpdatesApi
  }
}
