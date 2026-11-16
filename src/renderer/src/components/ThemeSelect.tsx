import { useAppStore, type Theme } from '@/store/useAppStore'

export default function ThemeSelect({ className }: { className?: string }) {
  const theme = useAppStore(s => s.theme)
  const setTheme = useAppStore(s => s.setTheme)
  return <label className={className}>
    <span>Display theme</span>
    <select value={theme} onChange={e => setTheme(e.currentTarget.value as Theme)}
      className="rounded border border-line bg-panel px-2 py-1 text-ink">
      <option value="light">Light</option>
      <option value="dark">Dark</option>
      <option value="eink">E-ink (high contrast)</option>
    </select>
  </label>
}
