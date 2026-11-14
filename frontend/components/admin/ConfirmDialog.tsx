'use client'

import type { ReactNode } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { buttonClass } from '@/components/ui/button'

/** Confirmation step for actions that switch access off. Confirming runs the page's existing handler. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: ReactNode
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <button type="button" data-autofocus onClick={onClose} className={buttonClass('outline', 'md')}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className={buttonClass('danger', 'md')}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[13px] text-ds-ink-2">{children}</div>
    </Dialog>
  )
}
