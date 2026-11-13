import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolveCallouts, type Callout, type GuidePage } from '../lib/format'

export interface IllustrationData { id: string; url: string; callouts: Callout[] }
interface CalloutRow { id: string; label: string; target_kind: 'category' | 'product'; target_id: string; px: number | string; py: number | string; lx: number | string; ly: number | string }

export const toCallout = (r: CalloutRow): Callout => ({ id: r.id, label: r.label, targetKind: r.target_kind, targetId: r.target_id, px: Number(r.px), py: Number(r.py), lx: Number(r.lx), ly: Number(r.ly) })

/** The picture and callouts of one guide page. null while loading or when the page has none (also before 0014 is applied). */
export function useIllustration(kind: 'category' | 'product', pageId: string): IllustrationData | null {
  const [data, setData] = useState<IllustrationData | null>(null)
  useEffect(() => {
    let live = true
    setData(null)
    ;(async () => {
      const ill = await supabase.from('guide_illustrations').select('id,image_path').eq('page_kind', kind).eq('page_id', pageId).maybeSingle()
      if (!live || ill.error || !ill.data) return
      const [signed, rows] = await Promise.all([
        supabase.storage.from('guide-illustrations').createSignedUrl(ill.data.image_path as string, 3600),
        supabase.from('guide_callouts').select('id,label,target_kind,target_id,px,py,lx,ly').eq('illustration_id', ill.data.id as string).order('sort_order').order('id'),
      ])
      if (!live || !signed.data?.signedUrl) return
      setData({ id: ill.data.id as string, url: signed.data.signedUrl, callouts: ((rows.data ?? []) as CalloutRow[]).map(toCallout) })
    })().catch(() => undefined)
    return () => { live = false }
  }, [kind, pageId])
  return data
}

/** A page code in boxes that turn red when hovered or focused, like the printed Smart Guide. */
export function RedCode({ code, active }: { code: string; active: boolean }) {
  const box = `inline-grid place-items-center border font-mono font-bold w-3.5 h-4 text-[9px] sm:w-[18px] sm:h-5 sm:text-[11px] ${active ? 'border-red-700 bg-red-600 text-white' : 'border-steel-950 bg-white text-steel-950'}`
  return <span className="inline-flex gap-px" aria-hidden="true">{[...code].map((ch, i) => <span key={i} className={box}>{ch}</span>)}</span>
}

/** The picture of a guide page with its callouts. Clicking a label, a code or the dot opens that page. Shows nothing when the page has no picture. */
export default function GuideIllustration({ kind, pageId, pages, onOpen, accent = '#003080' }: { kind: 'category' | 'product'; pageId: string; pages: GuidePage[]; onOpen: (url: string) => void; accent?: string }) {
  const data = useIllustration(kind, pageId)
  const [hover, setHover] = useState('')
  if (!data) return null
  const items = resolveCallouts(data.callouts, pages)
  return (
    <section aria-label="Illustration. Click a code to open that page." className="mx-auto w-full max-w-3xl">
      <div className="relative select-none">
        <img src={data.url} alt="Illustration of this page" draggable={false} className="block w-full h-auto" />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none">
          {items.map((c) => <line key={c.id} x1={c.lx} y1={c.ly} x2={c.px} y2={c.py} stroke={hover === c.id ? '#dc2626' : accent} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />)}
        </svg>
        {items.map((c) => {
          const on = hover === c.id
          const enter = () => setHover(c.id), leave = () => setHover('')
          return (
            <span key={c.id}>
              <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => onOpen(c.url)} onMouseEnter={enter} onMouseLeave={leave}
                style={{ left: `${c.px}%`, top: `${c.py}%`, background: on ? '#dc2626' : accent }} className="absolute -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white cursor-pointer" />
              <button type="button" onClick={() => onOpen(c.url)} onMouseEnter={enter} onMouseLeave={leave} onFocus={enter} onBlur={leave}
                aria-label={`Open ${c.label || 'page'}, page ${c.code}`} title={c.label || c.code}
                style={{ left: `${c.lx}%`, top: `${c.ly}%` }} className="absolute -translate-x-1/2 -translate-y-1/2 max-w-[34%] text-center leading-none bg-white/80 px-0.5 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                {c.label && <span className={`block text-[8px] sm:text-[10px] font-bold uppercase leading-tight mb-0.5 ${on ? 'text-red-600' : 'text-steel-950'}`}>{c.label}</span>}
                <RedCode code={c.code} active={on} />
              </button>
            </span>)
        })}
      </div>
    </section>
  )
}
