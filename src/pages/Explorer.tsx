import { useNavigate, Link } from 'react-router-dom'

const ZONES = [
  { key: 'chain', label: 'Chain' }, { key: 'modular_belt', label: 'Modular belt' }, { key: 'sprocket', label: 'Sprockets' },
  { key: 'guide_rail', label: 'Guide rail' }, { key: 'wearstrip', label: 'Wearstrip' }, { key: 'accessories', label: 'Accessories' },
] as const
type Zone = (typeof ZONES)[number]['key']

export default function Explorer() {
  const nav = useNavigate()
  const go = (z: Zone) => nav(`/categories?zone=${z}`)
  const hot = (z: Zone, label: string) => ({
    tabIndex: 0, role: 'link' as const, 'aria-label': label, className: 'cursor-pointer outline-none group',
    onClick: () => go(z), onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(z) } },
  })
  const teeth = (cx: number) => <circle cx={cx} cy="190" r="34" fill="none" stroke="currentColor" strokeWidth="9" strokeDasharray="7 6" />
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold">Conveyor explorer</h1>
      <p className="text-steel-600">Select a part of the conveyor to see matching categories.</p>
      <svg viewBox="0 0 640 300" role="group" aria-label="Conveyor illustration with selectable parts" className="w-full max-w-3xl border border-steel-300 bg-white text-steel-600">
        <g {...hot('guide_rail', 'Guide rail')} className="cursor-pointer outline-none text-steel-800 hover:text-belt-600 focus-visible:text-belt-600">
          <rect x="90" y="96" width="460" height="10" fill="currentColor" />
          <text x="318" y="88" textAnchor="middle" fontSize="13" fill="#27343f">Guide rail</text>
        </g>
        <g {...hot('modular_belt', 'Modular belt')} className="cursor-pointer outline-none text-belt-700 hover:text-belt-600 focus-visible:text-belt-600">
          {Array.from({ length: 12 }, (_, i) => <rect key={i} x={110 + i * 37} y="112" width="33" height="14" rx="2" fill="currentColor" />)}
          <text x="318" y="190" textAnchor="middle" fontSize="13" fill="#1d5a78">Modular belt</text>
        </g>
        <g {...hot('chain', 'Chain')} className="cursor-pointer outline-none text-steel-800 hover:text-belt-600 focus-visible:text-belt-600">
          <path d="M126 224 H514" stroke="currentColor" strokeWidth="6" strokeDasharray="14 5" fill="none" />
          <text x="318" y="250" textAnchor="middle" fontSize="13" fill="#27343f">Chain (return run)</text>
        </g>
        <g {...hot('sprocket', 'Sprockets')} className="cursor-pointer outline-none text-steel-800 hover:text-belt-600 focus-visible:text-belt-600">
          {teeth(110)}{teeth(530)}<circle cx="110" cy="190" r="8" fill="currentColor" /><circle cx="530" cy="190" r="8" fill="currentColor" />
          <text x="110" y="250" textAnchor="middle" fontSize="13" fill="#27343f">Sprocket</text>
        </g>
        <g {...hot('wearstrip', 'Wearstrip')} className="cursor-pointer outline-none text-amber-chain hover:text-belt-600 focus-visible:text-belt-600">
          <rect x="140" y="134" width="360" height="8" fill="currentColor" />
          <text x="318" y="170" textAnchor="middle" fontSize="13" fill="#27343f">Wearstrip</text>
        </g>
        <g {...hot('accessories', 'Accessories')} className="cursor-pointer outline-none text-steel-600 hover:text-belt-600 focus-visible:text-belt-600">
          <rect x="560" y="40" width="64" height="44" rx="4" fill="none" stroke="currentColor" strokeWidth="3" />
          <text x="592" y="67" textAnchor="middle" fontSize="12" fill="#27343f">Accessories</text>
        </g>
      </svg>
      <nav aria-label="Conveyor parts" className="max-w-3xl">
        <h2 className="font-semibold mb-2">Or choose from the list</h2>
        <ul className="flex flex-wrap gap-2">
          {ZONES.map((z) => <li key={z.key}><Link className="block border border-steel-300 bg-white px-3 py-2 hover:bg-belt-100" to={`/categories?zone=${z.key}`}>{z.label}</Link></li>)}
        </ul>
        <p className="mt-3 text-sm"><Link className="underline" to="/categories">Browse all categories</Link></p>
      </nav>
    </div>
  )
}
