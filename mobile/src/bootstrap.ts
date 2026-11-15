import { registerPlugin } from '@capacitor/core'
import { App } from '@capacitor/app'
import { startLibraryWorker } from './libraryWorkerClient'
import { libraryApi } from './libraryApi'
import { personalApi, notebookApi } from './personalApi'

const study = registerPlugin<{ openCorpus(): Promise<{ key: string }> }>('Study')

export async function initializeMobileApi(): Promise<void> {
  const { key } = await study.openCorpus()
  await startLibraryWorker(key)
  window.api = {
    ...libraryApi,
    ...personalApi,
    version: async () => (await App.getInfo()).version
  }
  window.notebook = notebookApi
}
