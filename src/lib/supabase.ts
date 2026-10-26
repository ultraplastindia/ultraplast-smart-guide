import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim()
const anon = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim()

// A wrong value (for example a URL without https://) used to crash the whole page at start-up.
export const isConfigured = Boolean(url && anon && /^https?:\/\/[^\s/]+/.test(url) && anon.length > 20)

// Anon key only. The service-role key must never reach the browser.
export const supabase = createClient(
  isConfigured ? (url as string) : 'http://localhost:54321',
  isConfigured ? (anon as string) : 'missing-anon-key-placeholder',
)
