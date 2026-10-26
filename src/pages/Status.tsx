import { useAuth } from '../lib/auth'
import { STATUS_LABEL } from '../lib/access'

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const { signOut, refresh, status } = useAuth()
  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="max-w-md bg-white border border-steel-300 p-6 space-y-3">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-sm text-steel-600">Status: {STATUS_LABEL[status]}</p>
        {children}
        <div className="flex gap-2 pt-2">
          <button onClick={() => void refresh()} className="border border-steel-300 px-3 py-2 text-sm">Check again</button>
          <button onClick={() => void signOut()} className="border border-steel-300 px-3 py-2 text-sm">Sign out</button>
        </div>
      </div>
    </div>
  )
}

export function Pending() {
  return <Shell title="Waiting for approval"><p>Your email is registered. An Ultraplast administrator must approve your account before you can open the catalogue. If your email is not yet verified, use the link we sent you first.</p></Shell>
}

export function Denied() {
  return <Shell title="Access denied"><p>This account cannot open the catalogue. Contact your Ultraplast administrator if you think this is a mistake.</p></Shell>
}
