import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

interface Req {
  id: string; reference: string; name: string; company: string | null; email: string; phone: string | null; message: string | null; status: string; created_at: string
  rfq_items: { id: string; product_code_snapshot: string; name_snapshot: string; quantity: number }[]
}
const STATUS: [string, string][] = [['new', 'New'], ['in_progress', 'In progress'], ['quoted', 'Quoted'], ['closed', 'Closed']]

export default function AdminRfq() {
  const [rows, setRows] = useState<Req[] | null>(null)
  const [filter, setFilter] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    let q = supabase.from('rfq_requests').select('id,reference,name,company,email,phone,message,status,created_at,rfq_items(id,product_code_snapshot,name_snapshot,quantity)').order('created_at', { ascending: false }).limit(200)
    if (filter) q = q.eq('status', filter)
    const { data, error } = await q
    if (error) setMsg({ ok: false, text: error.message }); else setRows(data as unknown as Req[])
  }, [filter])
  useEffect(() => { void load() }, [load])

  const setStatus = async (id: string, status: string) => {
    const { error } = await supabase.rpc('set_rfq_status', { p_id: id, p_status: status })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Status updated.' })
    if (!error) await load()
  }
  const f = 'border border-steel-300 px-2 py-1.5 bg-white text-sm'
  return (
    <div className="space-y-4">
      <p className="text-sm"><Link className="underline" to="/admin">Back to admin</Link></p>
      <h1 className="text-2xl font-bold">Quotation requests</h1>
      <p className="text-sm text-steel-600">Requests sent from the Smart Guide. Contact the customer by email or phone, then update the status. Email alerts are not set up, so check here regularly.</p>
      {msg && <p role="alert" className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-700'}`}>{msg.text}</p>}
      <div><label htmlFor="rs" className="sr-only">Status</label><select id="rs" className={f} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All statuses</option>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      {rows === null && !msg && <p role="status" className="text-steel-600">Loading…</p>}
      {rows?.length === 0 && <p className="text-steel-600">No requests yet.</p>}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto border border-steel-300 bg-white rounded-md"><table className="w-full text-sm">
          <thead className="bg-steel-100 text-left"><tr>{['Reference', 'Date', 'Customer', 'Contact', 'Items', 'Status', ''].map((h, i) => <th key={i} className="px-3 py-2">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (<Fragment key={r.id}>
            <tr className="border-t border-steel-300 align-top">
              <td className="px-3 py-2 font-mono">{r.reference}</td><td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2">{r.name}<span className="block text-xs text-steel-600">{r.company ?? ''}</span></td>
              <td className="px-3 py-2"><a className="underline" href={`mailto:${r.email}`}>{r.email}</a><span className="block text-xs text-steel-600">{r.phone ?? 'Not available'}</span></td>
              <td className="px-3 py-2">{r.rfq_items.length}</td>
              <td className="px-3 py-2"><label className="sr-only" htmlFor={`st-${r.id}`}>Status of {r.reference}</label><select id={`st-${r.id}`} className={f} value={r.status} onChange={(e) => void setStatus(r.id, e.target.value)}>{STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
              <td className="px-3 py-2"><button className="underline" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? 'Hide' : 'Details'}</button></td>
            </tr>
            {open === r.id && (<tr key={`${r.id}-d`} className="border-t border-steel-300 bg-steel-50"><td colSpan={7} className="px-4 py-3 space-y-2">
              <p className="text-sm"><b>Message:</b> {r.message ?? 'Not available'}</p>
              <table className="text-sm border border-steel-300 bg-white"><thead className="bg-steel-100 text-left"><tr><th className="px-3 py-1">Product code</th><th className="px-3 py-1">Name</th><th className="px-3 py-1">Qty</th></tr></thead>
                <tbody>{r.rfq_items.map((i) => <tr key={i.id} className="border-t border-steel-300"><td className="px-3 py-1 font-mono">{i.product_code_snapshot}</td><td className="px-3 py-1">{i.name_snapshot}</td><td className="px-3 py-1">{i.quantity}</td></tr>)}</tbody></table>
            </td></tr>)}
          </Fragment>))}</tbody></table></div>)}
    </div>
  )
}
