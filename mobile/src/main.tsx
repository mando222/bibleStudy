import RestoreNotice from './RestoreNotice'
import { createRoot } from 'react-dom/client'
import { initializeMobileApi } from './bootstrap'
import { initializeStudyStorage, studyStorageKey } from '@/lib/studyPreferences'
import { initializePhonePreferences, positionKey, sizeKey } from './phonePreferences'
import { initialLocation, initialPreferences, loadLocal } from './study'
import { plainDisplay } from '@shared/readingDisplay'
import '@/styles/globals.css'
import './style.css'
import './toolTypography.css'
import './readerTypography.css'

const root = createRoot(document.getElementById('root')!)
async function start() {
  root.render(
    <div className="startup" role="status">
      <h1>Open Bible Study</h1>
      <p>Opening your offline library…</p>
    </div>
  )
  try {
    await initializeMobileApi()
    await initializeStudyStorage()
    const key = studyStorageKey()
    if (key === 'obs-app-state' && !localStorage.getItem(key)) {
      const place = initialLocation(),
        prefs = initialPreferences()
      const legacy = loadLocal<{ size?: number }>('settings', {})
      localStorage.setItem(positionKey(), JSON.stringify({ ...place, scroll: null }))
      if (legacy.size && legacy.size !== 21) localStorage.setItem(sizeKey(), String(legacy.size))
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          state: {
            book: place.book,
            chapter: place.chapter,
            primary: place.translation,
            referenceEdition: place.translation,
            parallels: [place.translation],
            activeVerse: place.verse,
            scrollToVerse: place.verse > 1 ? place.verse : null,
            preferredTextOrder: prefs.order,
            restoreSourceWords: prefs.restore,
            sourceWordTerms: prefs.terms,
            sourceFormIds: prefs.ids,
            displayDefaults: { ...plainDisplay, literary: prefs.layout, headings: prefs.layout },
            theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
          }
        })
      )
    }
    initializePhonePreferences()
    const { default: App } = await import('./App')
    root.render(<><App /><RestoreNotice /></>)
  } catch (error) {
    root.render(
      <div className="startup" role="alert">
        <h1>Open Bible Study</h1>
        <p>{error instanceof Error ? error.message : 'Could not open the offline library.'}</p>
        <button className="phone-button" onClick={() => location.reload()}>
          Retry
        </button>
      </div>
    )
  }
}
void start()
