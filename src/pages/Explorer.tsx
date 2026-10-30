import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listCategories, type Category } from '../lib/catalogue'
import { useAuth } from '../lib/auth'

const ZONES = [
  { key: 'guide_rail', label: 'Guide rail' }, { key: 'modular_belt', label: 'Modular belt' }, { key: 'wearstrip', label: 'Wearstrip' },
  { key: 'sprocket', label: 'Sprockets' }, { key: 'chain', label: 'Chain' }, { key: 'accessories', label: 'Accessories' },
] as const
type Zone = (typeof ZONES)[number]['key']

export default function Explorer() {
  const nav = useNavigate()
  const { can } = useAuth()
  const [cats, setCats] = useState<Category[] | null>(null)
  useEffect(() => { listCategories().then(setCats).catch(() => setCats([])) }, [])

  const inZone = (z: Zone) => (cats ?? []).filter((c) => c.explorer_zone === z)
  const label = (z: Zone) => { const base = ZONES.find((x) => x.key === z)!.label; return cats === null ? base : `${base} (${inZone(z).length})` }
  // One category: open it directly. Several or none: show the categories page for this area.
  const go = (z: Zone) => { const l = inZone(z); nav(l.length === 1 ? `/catalogue?category=${l[0].id}` : `/categories?zone=${z}`) }
  const hot = (z: Zone) => ({
    tabIndex: 0, role: 'link' as const, 'aria-label': `${label(z)} categories`, className: 'group cursor-pointer outline-none',
    onClick: () => go(z), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(z) } },
  })
  const text = 'fill-steel-950 group-hover:fill-brand-green group-focus-visible:fill-brand-green'
  const leader = 'stroke-steel-300 group-hover:stroke-brand-green group-focus-visible:stroke-brand-green'

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Conveyor explorer</h1>
      <p className="text-steel-600">Select a part of the conveyor to see its categories. The number shows how many categories are linked to each part.</p>
      <svg viewBox="0 0 760 300" role="group" aria-label="Conveyor illustration with selectable parts" className="w-full max-w-4xl bg-white border border-steel-300 rounded-md">
        <g aria-hidden="true" className="text-steel-100" fill="currentColor">
          <rect x="96" y="250" width="448" height="8" /><rect x="150" y="258" width="8" height="34" /><rect x="482" y="258" width="8" height="34" />
        </g>

        <g {...hot('accessories')}>
          <g className="text-steel-600 group-hover:text-brand-green"><rect x="446" y="112" width="20" height="30" rx="3" fill="none" stroke="currentColor" strokeWidth="3" /></g>
          <line x1="466" y1="114" x2="600" y2="26" strokeWidth="1.5" className={leader} />
          <text x="608" y="28" fontSize="15" fontWeight="600" className={text}>{label('accessories')}</text>
        </g>

        <g {...hot('guide_rail')}>
          <g className="text-steel-800 group-hover:text-brand-green"><rect x="150" y="122" width="324" height="8" fill="currentColor" /></g>
          <line x1="474" y1="126" x2="600" y2="72" strokeWidth="1.5" className={leader} />
          <text x="608" y="74" fontSize="15" fontWeight="600" className={text}>{label('guide_rail')}</text>
        </g>

        <g {...hot('modular_belt')}>
          <g className="text-belt-700 group-hover:text-brand-green">
            {Array.from({ length: 16 }, (_, i) => <rect key={i} x={120 + i * 25} y="140" width="23" height="12" rx="2" fill="currentColor" />)}
          </g>
          <line x1="519" y1="146" x2="600" y2="116" strokeWidth="1.5" className={leader} />
          <text x="608" y="120" fontSize="15" fontWeight="600" className={text}>{label('modular_belt')}</text>
        </g>

        <g {...hot('wearstrip')}>
          <g className="text-amber-chain group-hover:text-brand-green"><rect x="170" y="157" width="300" height="6" fill="currentColor" /></g>
          <line x1="470" y1="161" x2="600" y2="162" strokeWidth="1.5" className={leader} />
          <text x="608" y="166" fontSize="15" fontWeight="600" className={text}>{label('wearstrip')}</text>
        </g>

        <g {...hot('sprocket')}>
          <g className="text-steel-800 group-hover:text-brand-green" fill="none" stroke="currentColor">
            <circle cx="120" cy="190" r="36" strokeWidth="8" strokeDasharray="9 6" /><circle cx="520" cy="190" r="36" strokeWidth="8" strokeDasharray="9 6" />
            <circle cx="120" cy="190" r="10" fill="currentColor" /><circle cx="520" cy="190" r="10" fill="currentColor" />
          </g>
          <line x1="560" y1="192" x2="600" y2="206" strokeWidth="1.5" className={leader} />
          <text x="608" y="210" fontSize="15" fontWeight="600" className={text}>{label('sprocket')}</text>
        </g>

        <g {...hot('chain')}>
          <g className="text-steel-800 group-hover:text-brand-green"><path d="M120 232 H520" stroke="currentColor" strokeWidth="6" strokeDasharray="14 5" fill="none" /></g>
          <line x1="450" y1="232" x2="600" y2="252" strokeWidth="1.5" className={leader} />
          <text x="608" y="256" fontSize="15" fontWeight="600" className={text}>{label('chain')}</text>
        </g>
      </svg>

      <nav aria-label="Conveyor parts" className="max-w-4xl">
        <h2 className="font-semibold mb-2">Or choose from the list</h2>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ZONES.map((z) => {
            const n = inZone(z.key).length
            return (
              <li key={z.key}><button onClick={() => go(z.key)} className="w-full text-left bg-white border border-steel-300 rounded-md px-3 py-2 hover:border-brand-green hover:shadow-sm">
                <span className="font-medium">{z.label}</span>
                <span className="block text-xs text-steel-600">{cats === null ? 'Loading…' : n === 0 ? 'No categories linked yet' : `${n} categor${n === 1 ? 'y' : 'ies'}`}</span></button></li>)
          })}
        </ul>
        <p className="mt-3 text-sm space-x-4"><Link className="underline" to="/categories">Browse all categories</Link>{can('manage_catalogue') && <Link className="underline" to="/admin/categories">Link categories to these parts (Admin)</Link>}</p>
      </nav>
    </div>
  )
}
