'use client'

import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { introVideo } from '@/lib/landing-content'
import { getLenis } from '@/lib/lenis'

export default function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const video = videoRef.current
    if (!open || !dialog || !video) return undefined
    dialog.showModal()
    getLenis()?.stop()
    video.play().catch(() => {
      // Autoplay can be refused. The visible controls still let the visitor press play.
    })
    return () => {
      video.pause()
      video.currentTime = 0
      dialog.close()
      getLenis()?.start()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      aria-label={introVideo.title}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose()
      }}
      className="m-auto w-[min(60rem,calc(100vw-2rem))] overflow-visible rounded-[20px] bg-transparent backdrop:bg-ink/70"
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close video"
          className="absolute -top-12 right-0 grid h-10 w-10 place-items-center rounded-full bg-white text-ink shadow-lg"
        >
          <X size={20} aria-hidden="true" />
        </button>
        <video
          ref={videoRef}
          src={introVideo.src}
          controls
          playsInline
          preload="none"
          width={1920}
          height={1080}
          className="block aspect-video w-full rounded-[20px] bg-ink"
        />
      </div>
    </dialog>
  )
}
