import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { LOGO_DATA_URL } from '../lib/logo'
import PrintHeader from './PrintHeader'
import RfqDrawer from './RfqDrawer'

const NAV = [
  ['/', 'Home'],
  ['/categories', 'Categories'],
  ['/explorer', 'Explorer'],
  ['/guide', 'Guide'],
  ['/catalogue', 'Catalogue'],
  ['/compare', 'Compare'],
  ['/documents', 'Documents'],
  ['/bom', 'My BOM'],
  ['/dashboard', 'Dashboard'],
  ['/help', 'Help'],
] as const

export default function Layout() {
  const [open, setOpen] = useState(false)
  const [logoOk, setLogoOk] = useState(true)
  const { signOut, session, can } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-sm text-sm font-medium ${isActive ? 'bg-amber-chain text-steel-950' : 'text-steel-100 hover:bg-steel-800'}`
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
      <header className="sticky top-0 z-40 bg-steel-950 shadow-md print:hidden">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex items-center justify-between gap-4 py-2.5">
            <a href="https://www.ultraplastindia.com/" target="_blank" rel="noopener noreferrer" aria-label="Ultraplast Chainbelts Pvt. Ltd. website" className="flex items-center gap-3 min-w-0">
              {logoOk && <img src={LOGO_DATA_URL} alt="" className="h-9 w-auto shrink-0 bg-white px-2.5 py-1.5 rounded-md" onError={() => setLogoOk(false)} />}
              <span className="hidden sm:block h-8 w-px bg-white/25" aria-hidden="true" />
              <span className="truncate text-white font-semibold tracking-tight text-base sm:text-lg leading-tight">Ultraplast Chainbelts Pvt. Ltd.</span>
            </a>
            <div className="hidden lg:flex items-center gap-2 shrink-0">
              <NavLink to="/profile" className={link}>Profile</NavLink>
              <button onClick={() => void signOut()} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-steel-100 border border-white/25 rounded-sm hover:bg-white/10" title={session?.user.email ?? ''}>
                <LogOut size={16} aria-hidden /> Sign out
              </button>
            </div>
            <button className="lg:hidden text-white p-2" aria-expanded={open} aria-label="Toggle menu" onClick={() => setOpen(!open)}>
              {open ? <X /> : <Menu />}
            </button>
          </div>
          <nav aria-label="Main" className={`${open ? 'block' : 'hidden'} lg:flex lg:flex-wrap lg:items-center lg:gap-1 border-t border-white/10 py-2 max-h-[70vh] overflow-y-auto lg:overflow-visible`}>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={link} onClick={() => setOpen(false)}>{label}</NavLink>
            ))}
            {can('manage_catalogue') && <NavLink to="/admin" end className={link} onClick={() => setOpen(false)}>Admin</NavLink>}
            <div className="lg:hidden mt-1 pt-1 border-t border-white/10">
              <NavLink to="/profile" className={link} onClick={() => setOpen(false)}>Profile</NavLink>
              <button onClick={() => void signOut()} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-steel-100 hover:text-white" title={session?.user.email ?? ''}>
                <LogOut size={16} aria-hidden /> Sign out
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1 mx-auto w-full max-w-7xl px-4 py-8"><PrintHeader /><Outlet /></main>
      <footer className="print:hidden border-t border-steel-300 py-4 text-center text-xs text-steel-600">
        Ultraplast Chainbelts Pvt. Ltd. — internal engineering guide. Data shown as “Not available” when unverified.
      </footer>
      <RfqDrawer />
    </div>
  )
}
