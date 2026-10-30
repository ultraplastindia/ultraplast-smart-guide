import { useCallback, useEffect, useRef, useState } from 'react'

export interface GalleryImage { url: string; caption?: string | null }

/** Fixed-size frame: every image sits fully inside the same box, whatever its shape. */
export function Frame({ src, alt, className = '', onClick }: { src?: string; alt: string; className?: string; onClick?: () => void }) {
  const base = `aspect-[4/3] w-full bg-white border border-steel-300 rounded-md overflow-hidden flex items-center justify-center ${className}`
  const inner = src ? <img src={src} alt={alt} loading="lazy" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-steel-600">No image</span>
  return onClick && src
    ? <button type="button" onClick={onClick} aria-label={`Enlarge: ${alt}`} className={`${base} cursor-zoom-in hover:border-brand-green focus-visible:border-brand-green`}>{inner}</button>
    : <div className={base}>{inner}</div>
}

/** Full-screen viewer with zoom in, zoom out, reset, drag to move, and previous/next. */
export function Lightbox({ images, start, onClose }: { images: GalleryImage[]; start: number; onClose: () => void }) {
  const n = images.length
  const [i, setI] = useState(start)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const img = images[i]

  const reset = useCallback(() => { setZoom(1); setPos({ x: 0, y: 0 }) }, [])
  const zoomBy = useCallback((d: number) => setZoom((cur) => Math.min(5, Math.max(1, Math.round((cur + d) * 100) / 100))), [])
  const go = useCallback((d: number) => { setI((cur) => (cur + d + n) % n); reset() }, [n, reset])
  useEffect(() => { if (zoom === 1) setPos({ x: 0, y: 0 }) }, [zoom])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomBy(0.5)
      else if (e.key === '-') zoomBy(-0.5)
      else if (e.key === '0') reset()
      else if (e.key === 'ArrowRight' && n > 1) go(1)
      else if (e.key === 'ArrowLeft' && n > 1) go(-1)
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [onClose, zoomBy, reset, go, n])

  const btn = 'bg-white/15 hover:bg-white/30 text-white px-3 py-1.5 rounded text-sm'
  return (
    <div role="dialog" aria-modal="true" aria-label="Image viewer" className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 text-white text-sm">
        <span>{img.caption ?? ''}{n > 1 ? ` (${i + 1} of ${n})` : ''}</span>
        <div className="flex gap-2">
          <button className={btn} onClick={() => zoomBy(-0.5)} aria-label="Zoom out">Zoom out −</button>
          <button className={btn} onClick={() => zoomBy(0.5)} aria-label="Zoom in">Zoom in +</button>
          <button className={btn} onClick={reset}>Reset</button>
          <button ref={closeRef} className={btn} onClick={onClose}>Close ✕</button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden grid place-items-center touch-none select-none"
        onWheel={(e) => zoomBy(e.deltaY < 0 ? 0.25 : -0.25)}
        onPointerDown={(e) => { if (zoom > 1) { drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; e.currentTarget.setPointerCapture(e.pointerId) } }}
        onPointerMove={(e) => { const d = drag.current; if (d) setPos({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }) }}
        onPointerUp={() => { drag.current = null }}>
        <img src={img.url} alt={img.caption ?? 'Product image'} draggable={false} onDoubleClick={() => (zoom > 1 ? reset() : setZoom(2.5))}
          style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'zoom-in', transition: drag.current ? 'none' : 'transform 0.12s' }}
          className="max-h-full max-w-full object-contain" />
        {n > 1 && (<>
          <button className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`} onClick={() => go(-1)} aria-label="Previous image">‹</button>
          <button className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`} onClick={() => go(1)} aria-label="Next image">›</button>
        </>)}
      </div>
      <p className="p-2 text-center text-xs text-white/70">Scroll or use + and − to zoom. Drag to move when zoomed. Double-click to zoom. Esc to close.</p>
    </div>
  )
}

/** Main framed image (click to zoom) with a thumbnail strip when there are several. */
export function Gallery({ images, name, compact }: { images: GalleryImage[]; name: string; compact?: boolean }) {
  const [sel, setSel] = useState(0)
  const [open, setOpen] = useState(false)
  if (images.length === 0) return <Frame alt={name} />
  const cur = images[Math.min(sel, images.length - 1)]
  return (
    <div className="space-y-2">
      <Frame src={cur.url} alt={cur.caption ?? name} onClick={() => setOpen(true)} />
      {!compact && <p className="text-xs text-steel-600 print:hidden">Click the image to zoom in or out.</p>}
      {!compact && images.length > 1 && (
        <div className="flex flex-wrap gap-2 print:hidden">
          {images.map((im, n) => (
            <button key={im.url} type="button" onClick={() => setSel(n)} aria-label={`Show image ${n + 1}`} aria-current={n === sel} className={`w-20 rounded-md ${n === sel ? 'ring-2 ring-brand-green' : ''}`}>
              <Frame src={im.url} alt={im.caption ?? `${name} ${n + 1}`} />
            </button>))}
        </div>)}
      {open && <Lightbox images={images} start={Math.min(sel, images.length - 1)} onClose={() => setOpen(false)} />}
    </div>
  )
}
