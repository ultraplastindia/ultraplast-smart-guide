import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { PANELS } from '../lib/access'

/** Shown in place of a screen the account may not use. It never sends the person to another panel. */
function NoAccess({ title, text, showPanels }: { title: string; text: string; showPanels?: boolean }) {
  const { canPanel } = useAuth()
  const mine = PANELS.filter(([k]) => k !== 'admin' && canPanel(k))
  return (
    <div role="alert" className="max-w-xl space-y-3 border border-steel-300 bg-white p-5">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="text-sm text-steel-800">{text}</p>
      {showPanels && mine.length > 0 && (
        <p className="text-sm">Your panels: {mine.map(([k, label, to], i) => <span key={k}>{i > 0 ? ', ' : ''}<Link className="underline" to={to}>{label}</Link></span>)}</p>)}
    </div>
  )
}

/** UX guard only; the database enforces the same permission on every call. */
export default function RequirePermission({ permission }: { permission: string }) {
  const { can } = useAuth()
  return can(permission) ? <Outlet /> : <NoAccess title="No access to this screen" text="Your account does not have the permission this screen needs. Ask an administrator if you need it." showPanels />
}

/** A panel the account's role does not include. Shows a message in place; nobody is redirected to another panel. */
export function PanelGate({ panel }: { panel: string }) {
  const { canPanel } = useAuth()
  return canPanel(panel) ? <Outlet /> : <NoAccess title="This panel is not assigned to your account" text="An administrator chooses which panels each role can open. Use the menu to open one of your panels, or ask an administrator to add this one." showPanels />
}
