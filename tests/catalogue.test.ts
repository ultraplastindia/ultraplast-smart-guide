import { describe, expect, it } from 'vitest'
import { NA, PAGE_SIZE, pageCount, parseParams, show, toRpcArgs } from '../src/lib/format'

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
})
