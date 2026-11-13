import { useCallback, useEffect, useRef, useState } from 'react'

export interface GalleryImage { url: string; caption?: string | null }

/** Fixed-size frame: every image sits fully inside the same box, whatever its shape. */
export function Frame({ src, alt, className = '', onClick }: { src?: string; alt: string; className?: string; onClick?: () => void }) {
  const base = `relative aspect-[4/3] w-full bg-white border border-steel-300 rounded-md overflow-hidden flex items-center justify-center ${className}`
  const inner = src ? <img src={src} alt={alt} loading="lazy" className="absolute inset-0 h-full w-full object-contain" /> : <span className="text-xs text-steel-600">No image</span>
  return onClick && src
    ? <button type="button" onClick={onClick} aria-label={`Enlarge: ${alt}`} className={`${base} cursor-zoom-in hover:border-brand-green focus-visible:border-brand-green`}>{inner}</button>
    : <div className={base}>{inner}</div>
}

/** Full-screen viewer. A tall picture fits the width and scrolls down; zoom in and out, drag to move, previous/next. */
export function Lightbox({ images, start, onClose }: { images: GalleryImage[]; start: number; onClose: () => void }) {
  const n = images.length
  const [i, setI] = useState(start)
  const [zoom, setZoom] = useState(1)
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const img = images[i]

  const reset = useCallback(() => { setZoom(1); box.current?.scrollTo({ top: 0, left: 0 }) }, [])
  const zoomBy = useCallback((d: number) => setZoom((cur) => Math.min(5, Math.max(1, Math.round((cur + d) * 100) / 100))), [])
  const go = useCallback((d: number) => { setI((cur) => (cur + d + n) % n); reset() }, [n, reset])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    const key = (e: KeyboardEvent) => {
      const el = box.current
      if (e.key === 'Escape') onClose()
      else if (e.key === '+' || e.key === '=') zoomBy(0.5)
      else if (e.key === '-') zoomBy(-0.5)
      else if (e.key === '0') reset()
      else if (e.key === 'ArrowRight' && n > 1) go(1)
      else if (e.key === 'ArrowLeft' && n > 1) go(-1)
      else if (el && e.key === 'ArrowDown') { e.preventDefault(); el.scrollBy({ top: 80 }) }
      else if (el && e.key === 'ArrowUp') { e.preventDefault(); el.scrollBy({ top: -80 }) }
      else if (el && e.key === 'PageDown') { e.preventDefault(); el.scrollBy({ top: el.clientHeight * 0.9 }) }
      else if (el && e.key === 'PageUp') { e.preventDefault(); el.scrollBy({ top: -el.clientHeight * 0.9 }) }
    }
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev }
  }, [onClose, zoomBy, reset, go, n])

  // plain scroll moves down the picture; Ctrl (or Cmd) + scroll zooms
  useEffect(() => {
    const el = box.current
    if (!el) return
    const wheel = (e: WheelEvent) => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomBy(e.deltaY < 0 ? 0.25 : -0.25) } }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => el.removeEventListener('wheel', wheel)
  }, [zoomBy])

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
      <div className="relative flex-1 min-h-0">
        <div ref={box} tabIndex={0} aria-label="Image, scrollable" className="absolute inset-0 overflow-auto select-none"
          onPointerDown={(e) => {
            const el = box.current
            if (!el || e.pointerType !== 'mouse' || e.button !== 0) return
            const r = el.getBoundingClientRect()
            if (e.clientX - r.left > el.clientWidth || e.clientY - r.top > el.clientHeight) return // on a scroll bar
            if (el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight) return
            drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop }
            el.setPointerCapture(e.pointerId)
          }}
          onPointerMove={(e) => { const d = drag.current; const el = box.current; if (d && el) { el.scrollLeft = d.sl - (e.clientX - d.x); el.scrollTop = d.st - (e.clientY - d.y) } }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          <div className="flex min-h-full w-full">
            <img src={img.url} alt={img.caption ?? 'Product image'} draggable={false} onDoubleClick={() => (zoom > 1 ? reset() : setZoom(2.5))}
              style={{ width: zoom > 1 ? `${zoom * 100}%` : undefined, maxWidth: zoom > 1 ? 'none' : '100%', cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
              className="m-auto block h-auto shrink-0" />
          </div>
        </div>
        {n > 1 && (<>
          <button className={`${btn} absolute left-3 top-1/2 -translate-y-1/2`} onClick={() => go(-1)} aria-label="Previous image">‹</button>
          <button className={`${btn} absolute right-3 top-1/2 -translate-y-1/2`} onClick={() => go(1)} aria-label="Next image">›</button>
        </>)}
      </div>
      <p className="p-2 text-center text-xs text-white/70">Scroll to see the rest of the picture. Ctrl + scroll or + and − to zoom. Drag to move. Double-click to zoom. Esc to close.</p>
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

/** Each character of a page code in its own box, like the printed page codes. Long codes stay a single label. */
export function CodeBoxes({ code, big }: { code: string; big?: boolean }) {
  if (code.length > 8) return <span className="font-mono text-sm font-bold bg-steel-950 text-white px-3 py-1 tracking-wider">{code}</span>
  return (
    <span className="inline-flex gap-1" aria-label={`Page code ${code}`}>
      {[...code].map((ch, i) => <span key={i} aria-hidden="true" className={`inline-grid place-items-center border-2 border-steel-950 bg-white font-mono font-bold group-hover:border-red-700 group-hover:bg-red-600 group-hover:text-white group-focus-visible:border-red-700 group-focus-visible:bg-red-600 group-focus-visible:text-white ${big ? 'w-8 h-10 text-xl' : 'w-5 h-6 text-xs'}`}>{ch}</span>)}
    </span>
  )
}
