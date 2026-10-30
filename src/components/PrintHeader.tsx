import { LOGO_DATA_URL } from '../lib/logo'

const COMPANY = 'Ultraplast Chainbelts Pvt. Ltd.'

/** Letterhead, faint watermark and footer. Visible only when a page is printed. */
export default function PrintHeader() {
  return (
    <>
      <div className="hidden print:block mb-6 pb-3 border-b-4 border-brand-green">
        <div className="flex items-center justify-between gap-6">
          <img src={LOGO_DATA_URL} alt={COMPANY} className="h-16 w-auto" />
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-navy">{COMPANY}</p>
            <p className="text-sm text-steel-600">www.ultraplastindia.com</p>
            <p className="text-xs text-steel-600">Printed on {new Date().toLocaleDateString()}</p>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className="hidden print:flex fixed inset-0 items-center justify-center pointer-events-none opacity-[0.07]">
        <div className="text-center">
          <img src={LOGO_DATA_URL} alt="" className="w-[420px] max-w-full mx-auto" />
          <p className="mt-4 text-4xl font-bold text-brand-navy">{COMPANY}</p>
        </div>
      </div>
      <div className="hidden print:block fixed bottom-0 left-0 right-0 text-center text-xs text-steel-600 border-t border-steel-300 bg-white py-1">
        {COMPANY} | www.ultraplastindia.com
      </div>
    </>
  )
}
