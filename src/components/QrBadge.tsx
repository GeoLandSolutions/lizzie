import { useState } from 'react'

// tiny QR in the bottom-right corner; click to grow it to full size, click again to shrink
export function QrBadge() {
  const [open, setOpen] = useState(false)
  return (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={open ? 'Shrink QR code' : 'Show QR code for lizzie.valuebase.ai'}
      title={open ? undefined : 'Scan to play'}
      className="fixed right-3 bottom-3 z-50 block cursor-pointer overflow-hidden rounded-lg shadow-2xl ring-1 ring-black/40 transition-transform duration-300 ease-out"
      style={{ transform: `scale(${open ? 1 : 0.2})`, transformOrigin: 'bottom right' }}
    >
      <img src="/qr.png" alt="" width={204} height={204} className="block h-[204px] w-[204px]" />
    </button>
  )
}
