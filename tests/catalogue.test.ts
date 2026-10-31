import { describe, expect, it } from 'vitest'
import { NA, PAGE_SIZE, buildPages, findPage, guideUrl, pageCount, pageIndexByCode, parseParams, show, toRpcArgs } from '../src/lib/format'

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
})
