import { describe, expect, it } from 'vitest'
import { NA, PAGE_SIZE, buildPages, clampPct, pointToPct, resolveCallouts, type Callout, findPage, guideUrl, isEmail, isOtpCode, mailResult, pageCount, pageIndexByCode, parseEmailList, parseParams, show, toRpcArgs, type MailLogRow } from '../src/lib/format'

describe('catalogue helpers', () => {
  it('shows "Not available" for missing values, never invents data', () => {
    for (const v of [null, undefined, '', '  ']) expect(show(v)).toBe(NA)
    expect(show(0)).toBe('0')
    expect(show('POM')).toBe('POM')
  })
  it('parses URL params defensively', () => {
    const p = parseParams(new URLSearchParams('q=abc&sort=evil&page=-3&category=not-a-uuid'))
    expect(p).toMatchObject({ q: 'abc', sort: 'name', page: 1, category: '' })
  })
  it('accepts a valid uuid and known sorts', () => {
    const id = '123e4567-e89b-12d3-a456-426614174000'
    const p = parseParams(new URLSearchParams(`category=${id}&sort=code&page=3`))
    expect(p).toMatchObject({ category: id, sort: 'code', page: 3 })
  })
  it('builds RPC args with null for empty filters and correct offset', () => {
    const a = toRpcArgs(parseParams(new URLSearchParams('page=3')))
    expect(a).toMatchObject({ p_q: null, p_category: null, p_limit: PAGE_SIZE, p_offset: 2 * PAGE_SIZE })
  })
  it('counts pages', () => {
    expect(pageCount(0)).toBe(1)
    expect(pageCount(PAGE_SIZE + 1)).toBe(2)
  })
  it('builds the guide page order: index, category, its products, then other products', () => {
    const pages = buildPages([{ id: 'a', name: 'Chains' }, { id: 'b', name: 'Belts' }], [
      { id: 'p2', code: 'B-2', name: 'Belt two', categoryId: 'b' }, { id: 'p1', code: 'A-1', name: 'Chain one', categoryId: 'a' }, { id: 'p9', code: 'Z-9', name: 'Loose', categoryId: null }])
    expect(pages.map((p) => p.code)).toEqual(['INDEX', 'C01', 'A-1', 'C02', 'B-2', 'C99', 'Z-9'])
    expect(guideUrl(pages[0])).toBe('/guide')
    expect(guideUrl(pages[2])).toBe('/guide/p/p1')
    expect(findPage(pages, 'c', 'b')).toBe(3)
    expect(findPage(pages, 'p', 'nope')).toBe(-1)
  })
  it('finds pages by code, ignoring case, spaces and dashes', () => {
    const pages = buildPages([{ id: 'a', name: 'Chains' }], [{ id: 'p1', code: '1001 FT-84', name: 'x', categoryId: 'a' }])
    expect(pageIndexByCode(pages, '1001ft84')).toBe(2)
    expect(pageIndexByCode(pages, 'c01')).toBe(1)
    expect(pageIndexByCode(pages, 'Index')).toBe(0)
    expect(pageIndexByCode(pages, 'missing')).toBe(-1)
    expect(pageIndexByCode(pages, '  ')).toBe(-1)
  })
  it('reads numeric filters and sends them only when set', () => {
    const p = parseParams(new URLSearchParams('pitch=25.4&width=abc&thickness=8'))
    expect(p).toMatchObject({ pitch: '25.4', width: '', thickness: '8' })
    const a = toRpcArgs(p)
    expect(a).toMatchObject({ p_pitch: 25.4, p_thickness: 8 })
    expect('p_width' in a).toBe(false)
    expect('p_pitch' in toRpcArgs(parseParams(new URLSearchParams('')))).toBe(false)
  })
})

describe('email settings helpers', () => {
  it('splits a typed list of addresses and removes duplicates', () => {
    expect(parseEmailList('Sales@Ultraplast.com, quotes@ultraplast.com;\n sales@ultraplast.com  ')).toEqual(['sales@ultraplast.com', 'quotes@ultraplast.com'])
    expect(parseEmailList('   ')).toEqual([])
  })
  it('recognises valid addresses and rejects odd ones', () => {
    expect(isEmail('a@b.co')).toBe(true)
    expect(isEmail('a@b')).toBe(false)
    expect(isEmail('a b@c.com')).toBe(false)
    expect(isEmail('"x"<a@b.co>')).toBe(false)
  })
  it('accepts only digit codes of 6 to 10 characters', () => {
    expect(isOtpCode('123456')).toBe(true)
    expect(isOtpCode(' 123456 ')).toBe(true)
    expect(isOtpCode('12345')).toBe(false)
    expect(isOtpCode('12345a')).toBe(false)
    expect(isOtpCode('12345678901')).toBe(false)
  })
  const row = (o: Partial<MailLogRow>): MailLogRow => ({ id: 1, kind: 'test', to_email: 'a@b.co', subject: null, reference: null, created_at: new Date(1_000_000).toISOString(), error: null, status_code: null, timed_out: null, net_error: null, response: null, ...o })
  it('explains each outcome in plain words', () => {
    expect(mailResult(row({ status_code: 200 }), 1_000_000).tone).toBe('ok')
    const bad = mailResult(row({ status_code: 403, response: '{"message":"The domain is not verified"}' }), 1_000_000)
    expect(bad.tone).toBe('bad')
    expect(bad.label).toContain('The domain is not verified')
    expect(mailResult(row({ error: 'Email is not set up yet' }), 1_000_000).tone).toBe('bad')
    expect(mailResult(row({ timed_out: true }), 1_000_000).tone).toBe('bad')
    expect(mailResult(row({}), 1_000_000 + 60_000).label).toBe('Sending…')
    expect(mailResult(row({}), 1_000_000 + 7 * 3_600_000).label).toContain('No result recorded')
  })
})

describe('guide illustration callouts', () => {
  const pages = buildPages([{ id: 'c1', name: 'Frames' }], [{ id: 'p1', code: '54060A', name: 'Support heads', categoryId: 'c1' }])
  const call = (over: Partial<Callout>): Callout => ({ id: 'x', label: 'L', targetKind: 'product', targetId: 'p1', px: 10, py: 10, lx: 20, ly: 20, ...over })
  it('keeps positions inside the picture', () => {
    expect(clampPct(-5)).toBe(0)
    expect(clampPct(140)).toBe(100)
    expect(clampPct(33.349)).toBe(33.3)
    expect(clampPct(Number.NaN)).toBe(0)
  })
  it('turns a pointer position into percent of the picture', () => {
    expect(pointToPct(150, 60, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ x: 25, y: 10 })
    expect(pointToPct(10, 10, { left: 100, top: 50, width: 200, height: 100 })).toEqual({ x: 0, y: 0 })
    expect(pointToPct(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 })
  })
  it('gives each callout the code and address of the page it opens, and drops callouts whose page is gone', () => {
    const out = resolveCallouts([call({ id: 'a' }), call({ id: 'b', targetKind: 'category', targetId: 'c1' }), call({ id: 'c', targetId: 'gone' })], pages)
    expect(out.map((o) => [o.id, o.code, o.url])).toEqual([['a', '54060A', '/guide/p/p1'], ['b', 'C01', '/guide/c/c1']])
  })
})
