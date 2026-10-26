import { describe, expect, it } from 'vitest'
import { UNCATEGORISED, fileStem, groupByCategory, hasUnverified, na, specText, totalQuantity } from '../src/lib/bom'

const item = (code: string, category: string | null, quantity = 1) => ({ product_code: code, category, quantity })

describe('BOM helpers', () => {
  it('groups by category, sorts codes, puts uncategorised last', () => {
    const g = groupByCategory([item('B2', 'Sprockets'), item('A1', null), item('A0', 'Chains'), item('A9', 'Chains')])
    expect(g.map((x) => x.category)).toEqual(['Chains', 'Sprockets', UNCATEGORISED])
    expect(g[0].items.map((i) => i.product_code)).toEqual(['A0', 'A9'])
  })
  it('totals quantities', () => {
    expect(totalQuantity([item('a', null, 3), item('b', null, 4)])).toBe(7)
    expect(totalQuantity([])).toBe(0)
  })
  it('shows Not available instead of inventing values', () => {
    expect(na(null)).toBe('Not available')
    expect(na('')).toBe('Not available')
    expect(na(0)).toBe('0')
  })
  it('makes safe file names', () => {
    expect(fileStem('BOM-261026-0001', 'Line 3 / Chain!')).toBe('BOM-261026-0001-line-3-chain')
    expect(fileStem('BOM-1', '???')).toBe('BOM-1')
  })
  it('flags unverified data and formats specs', () => {
    expect(hasUnverified([{ verification_status: 'verified' }, { verification_status: null }])).toBe(true)
    expect(hasUnverified([{ verification_status: 'verified' }])).toBe(false)
    expect(specText([{ key: 'Pitch', value: '25.4', unit: 'mm' }, { key: 'Colour', value: 'Blue', unit: null }])).toBe('Pitch: 25.4 mm; Colour: Blue')
  })
})
