import { useState } from 'react'
import ModalDialog from '@/components/ModalDialog'
import { exportRecoveryBackup, restoreNoticeKey } from './personalApi'

export default function RestoreNotice(): JSX.Element | null {
  const [open, setOpen] = useState(() => localStorage.getItem(restoreNoticeKey) === '1')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  if (!open) return null
  const dismiss = () => {
    if (busy) return
    localStorage.removeItem(restoreNoticeKey)
    setOpen(false)
  }
  const save = async () => {
    setBusy(true)
    setMessage('')
    try {
      const destination = await exportRecoveryBackup()
      if (destination) setMessage('Pre-restore backup saved.')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not save the backup.') }
    finally { setBusy(false) }
  }
  return <ModalDialog label="Study backup restored" close={dismiss} className="w-[min(26rem,90vw)]">
    <div className="phone-form p-4">
      <h2 className="font-semibold">Study backup restored</h2>
      <p>Your restored profile is open. A recovery copy of your previous study data is available in Files &amp; settings.</p>
      <button disabled={busy} onClick={() => void save()} className="phone-button">Save pre-restore backup…</button>
      {message && <p role="status">{message}</p>}
      <button disabled={busy} data-dismiss-restore onClick={dismiss} className="phone-button">Continue reading</button>
    </div>
  </ModalDialog>
}
