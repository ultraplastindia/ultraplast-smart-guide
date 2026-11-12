import { describe, expect, it } from 'vitest'
import { buildMessage, dotStuff, handle, parseRequest, sendSmtp, type Conn, type MailIn } from '../supabase/functions/smtp-mail/index'

const enc = new TextEncoder()
const dec = new TextDecoder()

/** A tiny in-memory stand-in for Gmail's SMTP server: it answers like the real one and records what it was sent. */
class FakeServer implements Conn {
  commands: string[] = []
  creds = ''
  data = ''
  closed = false
  private pending = ''
  private out = '220 smtp.test ESMTP ready\r\n'
  private inData = false
  private readonly opts: { badAuth?: boolean; refuse?: string; chunk?: number }
  constructor(opts: { badAuth?: boolean; refuse?: string; chunk?: number } = {}) { this.opts = opts }

  private reply(s: string) { this.out += `${s}\r\n` }
  private handleLine(line: string) {
    if (this.inData) {
      if (line === '.') { this.inData = false; this.reply('250 2.0.0 OK queued') } else this.data += `${line.startsWith('.') ? line.slice(1) : line}\r\n`
      return
    }
    this.commands.push(line.startsWith('AUTH') ? 'AUTH PLAIN <hidden>' : line)
    if (line.startsWith('EHLO')) this.reply('250-smtp.test at your service\r\n250-SIZE 35882577\r\n250 AUTH LOGIN PLAIN')
    else if (line.startsWith('AUTH PLAIN ')) {
      this.creds = atob(line.slice(11))
      this.reply(this.opts.badAuth ? '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 Learn more' : '235 2.7.0 Accepted')
    } else if (line.startsWith('MAIL FROM:')) this.reply('250 2.1.0 OK')
    else if (line.startsWith('RCPT TO:')) this.reply(this.opts.refuse && line.includes(this.opts.refuse) ? '550 5.1.1 No such user' : '250 2.1.5 OK')
    else if (line === 'DATA') { this.inData = true; this.reply('354 Go ahead') }
    else if (line === 'QUIT') this.reply('221 Bye')
    else this.reply('502 Command not implemented')
  }

  async write(p: Uint8Array): Promise<number> {
    this.pending += dec.decode(p)
    for (;;) {
      const i = this.pending.indexOf('\r\n')
      if (i < 0) break
      const line = this.pending.slice(0, i)
      this.pending = this.pending.slice(i + 2)
      this.handleLine(line)
    }
    return p.length
  }
  async read(p: Uint8Array): Promise<number | null> {
    if (this.out.length === 0) return null
    const n = Math.min(p.length, this.opts.chunk ?? p.length, this.out.length)
    p.set(enc.encode(this.out.slice(0, n)))
    this.out = this.out.slice(n)
    return n
  }
  close() { this.closed = true }
}

const PASS = 'abcdabcdabcdabcd'
const mail: MailIn = {
  user: 'sales@gmail.test', pass: PASS, fromName: 'Ultraplast Chainbelts', to: ['a@x.com', 'b@y.com'], replyTo: 'c@z.com',
  subject: 'New quotation – ₹ order', html: '<p>Café — total ₹2,500</p>\n<p>.dot line</p>', text: 'Café — total ₹2,500\n.dot line',
}
const run = (m: MailIn, s: FakeServer) => sendSmtp(s, m, 'BOUNDARY', new Date(Date.UTC(2026, 10, 6, 9, 0, 0)), 'msg-id')
async function failure(p: Promise<unknown>): Promise<string> {
  try { await p } catch (e) { return e instanceof Error ? e.message : String(e) }
  return ''
}
const unb64 = (s: string) => dec.decode(Uint8Array.from(atob(s.replace(/\s+/g, '')), (c) => c.charCodeAt(0)))

describe('SMTP relay', () => {
  it('speaks SMTP in the right order and delivers a correctly encoded message', async () => {
    const s = new FakeServer()
    await run(mail, s)
    expect(s.commands).toEqual(['EHLO ultraplast-mail', 'AUTH PLAIN <hidden>', 'MAIL FROM:<sales@gmail.test>', 'RCPT TO:<a@x.com>', 'RCPT TO:<b@y.com>', 'DATA', 'QUIT'])
    expect(s.creds).toBe(`\0sales@gmail.test\0${PASS}`)
    const [head, ...rest] = s.data.split('\r\n\r\n')
    expect(head).toContain('From: "Ultraplast Chainbelts" <sales@gmail.test>')
    expect(head).toContain('To: a@x.com, b@y.com')
    expect(head).toContain('Reply-To: c@z.com')
    expect(head).toContain('Subject: =?UTF-8?B?')
    expect(head).toContain('Message-ID: <msg-id@gmail.test>')
    const parts = rest.join('\r\n\r\n').split('--BOUNDARY').slice(1, -1).map((p) => unb64(p.split('\r\n\r\n')[1] ?? ''))
    expect(parts).toEqual([mail.text, mail.html])
    const subject = /Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(head)
    expect(unb64(subject ? subject[1] : '')).toContain('New quotation')
  })

  it('reads replies that arrive in tiny pieces, including multi-line ones', async () => {
    const s = new FakeServer({ chunk: 3 })
    await run(mail, s)
    expect(s.commands.length).toBe(7)
  })

  it('reports a wrong password clearly and never repeats the password', async () => {
    const msg = await failure(run(mail, new FakeServer({ badAuth: true })))
    expect(msg).toContain('535')
    expect(msg.includes(PASS)).toBe(false)
  })

  it('names the address that was refused', async () => {
    const msg = await failure(run(mail, new FakeServer({ refuse: 'b@y.com' })))
    expect(msg).toContain('b@y.com')
    expect(msg).toContain('550')
  })

  it('doubles a leading dot so the message cannot end early', () => {
    expect(dotStuff('a\n.b\n..c')).toBe('a\r\n..b\r\n...c')
  })

  it('cannot be tricked into adding headers through the subject or sender name', () => {
    const msg = buildMessage({ ...mail, subject: 'Hi\r\nBcc: evil@x.com', fromName: 'Eve"\r\nBcc: x@y.com' }, 'B', new Date(0), 'id')
    const head = msg.split('\r\n\r\n')[0]
    expect(head.split('\r\n').some((l) => l.startsWith('Bcc:'))).toBe(false)
    expect(head).toContain('Subject: Hi Bcc: evil@x.com')
  })
})

describe('request checks', () => {
  const ok = { smtp_user: 'sales@gmail.test', smtp_pass: PASS, from_name: 'Ultraplast', to: ['a@x.com'], subject: 'Hi', html: '<p>x</p>', text: 'x' }
  it('accepts a good request', () => {
    const r = parseRequest(ok)
    expect(r.ok).toBe(true)
  })
  it('rejects bad input with a plain message', () => {
    const msg = (o: Record<string, unknown>) => { const r = parseRequest({ ...ok, ...o }); return r.ok ? '' : r.error }
    expect(msg({ smtp_user: 'nope' })).toContain('Gmail address')
    expect(msg({ smtp_pass: 'short' })).toContain('app password')
    expect(msg({ to: [] })).toContain('Recipients')
    expect(msg({ to: ['bad'] })).toContain('Recipients')
    expect(msg({ to: Array.from({ length: 11 }, (_, i) => `u${i}@x.com`) })).toContain('Recipients')
    expect(msg({ subject: '' })).toContain('subject')
    expect(msg({ html: '' })).toContain('empty')
    expect(msg({ reply_to: 'bad' })).toContain('reply-to')
    expect(parseRequest('text').ok).toBe(false)
  })
})

describe('the Edge Function entry point', () => {
  const KEY = 'secretkey'
  const post = (body: unknown, key: string | null = KEY) =>
    new Request('https://x.test/functions/v1/smtp-mail', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: key ? { 'x-relay-key': key } : {} })
  const good = { smtp_user: 'sales@gmail.test', smtp_pass: PASS, to: ['a@x.com'], subject: 'Hi', html: '<p>x</p>' }

  it('sends the mail, answers 200 and closes the connection', async () => {
    const s = new FakeServer()
    const res = await handle(post(good), KEY, async () => s)
    expect(res.status).toBe(200)
    expect(s.closed).toBe(true)
    expect(s.commands).toContain('DATA')
  })
  it('refuses a wrong or missing relay key, so nobody else can use it', async () => {
    expect((await handle(post(good, 'wrong'), KEY, async () => new FakeServer())).status).toBe(401)
    expect((await handle(post(good, null), KEY, async () => new FakeServer())).status).toBe(401)
  })
  it('refuses to run until the key has been filled in', async () => {
    expect((await handle(post(good), '__RELAY_KEY__', async () => new FakeServer())).status).toBe(500)
  })
  it('answers 405 to anything but POST and 400 to bad bodies', async () => {
    expect((await handle(new Request('https://x.test/', { method: 'GET' }), KEY, async () => new FakeServer())).status).toBe(405)
    expect((await handle(post('not json'), KEY, async () => new FakeServer())).status).toBe(400)
    expect((await handle(post({ ...good, to: [] }), KEY, async () => new FakeServer())).status).toBe(400)
  })
  it('turns connection and sign-in problems into a readable 502', async () => {
    const down = await handle(post(good), KEY, async () => { throw new Error('connection refused') })
    expect(down.status).toBe(502)
    expect(((await down.json()) as { error: string }).error).toContain('connection refused')
    const s = new FakeServer({ badAuth: true })
    const bad = await handle(post(good), KEY, async () => s)
    expect(bad.status).toBe(502)
    expect(((await bad.json()) as { error: string }).error).toContain('535')
    expect(s.closed).toBe(true)
  })
})
