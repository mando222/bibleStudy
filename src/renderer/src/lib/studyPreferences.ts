let storageKey = 'obs-app-state'
export const studyStorageKey = (): string => storageKey
export async function initializeStudyStorage(): Promise<void> {
  const profile = await window.api.studyProfile()
  if (!profile.id) return
  storageKey = `obs-app-state:${profile.id}`
  if (localStorage.getItem(storageKey) == null && profile.initialState) {
    localStorage.setItem(storageKey, profile.initialState)
  }
}
