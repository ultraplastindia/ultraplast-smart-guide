import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Menu, X, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth'

const NAV = [
  ['/', 'Home'],
  ['/categories', 'Categories'],
  ['/explorer', 'Explorer'],
  ['/catalogue', 'Catalogue'],
  ['/compare', 'Compare'],
  ['/documents', 'Documents'],
  ['/bom', 'My BOM'],
  ['/dashboard', 'Dashboard'],
  ['/help', 'Help'],
] as const

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { signOut, session, can } = useAuth()
  const link = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded-sm text-sm font-medium ${isActive ? 'bg-amber-chain text-steel-950' : 'text-steel-100 hover:bg-steel-800'}`
  return (
    <div className="min-h-screen flex flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2">Skip to content</a>
      <header className="bg-steel-950 print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-4">
          <NavLink to="/" className="text-white font-bold tracking-tight text-lg">
            Ultraplast <span className="text-amber-chain">Smart Conveyor Guide</span>
          </NavLink>
          <button className="lg:hidden text-white p-2" aria-expanded={open} aria-label="Toggle menu" onClick={() => setOpen(!open)}>
            {open ? <X /> : <Menu />}
          </button>
          <nav aria-label="Main" className={`${open ? 'block' : 'hidden'} lg:flex lg:items-center lg:gap-1 absolute lg:static left-0 right-0 top-14 bg-steel-950 p-3 lg:p-0 z-40`}>
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={link} onClick={() => setOpen(false)}>{label}</NavLink>
            ))}
            {can('manage_catalogue') && <NavLink to="/admin" end className={link} onClick={() => setOpen(false)}>Admin</NavLink>}
            {can('manage_users') && <NavLink to="/admin/access" className={link} onClick={() => setOpen(false)}>User access</NavLink>}
            {can('manage_imports') && <NavLink to="/admin/import" className={link} onClick={() => setOpen(false)}>Import</NavLink>}
            {can('manage_catalogue') && <NavLink to="/admin/review" className={link} onClick={() => setOpen(false)}>Review</NavLink>}
            <NavLink to="/profile" className={link} onClick={() => setOpen(false)}>Profile</NavLink>
            <button onClick={() => void signOut()} className="flex items-center gap-1 px-3 py-2 text-sm text-steel-300 hover:text-white" title={session?.user.email ?? ''}>
              <LogOut size={16} aria-hidden /> Sign out
            </button>
          </nav>
        </div>
      </header>
      <main id="main" className="flex-1 mx-auto w-full max-w-7xl px-4 py-8"><Outlet /></main>
      <footer className="print:hidden border-t border-steel-300 py-4 text-center text-xs text-steel-600">
        Ultraplast Chainbelts — internal engineering guide. Data shown as “Not available” when unverified.
      </footer>
    </div>
  )
}
