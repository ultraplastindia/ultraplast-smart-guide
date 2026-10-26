import { describe, expect, it } from 'vitest'
import { chunk, issuesToCsv, normaliseCode, validateRows } from '../src/lib/importer'

describe('import validation', () => {
  it('accepts a good row and keeps spec columns with their case', () => {
    const { valid, issues } = validateRows([{ product_code: '1001 FT-84', name: 'Flat top', pitch_mm: '25.4', 'spec:Rated capacity (N)': '1510' }])
    expect(issues).toEqual([])
    expect(valid[0].specs).toEqual({ 'Rated capacity (N)': '1510' })
    expect(valid[0].line).toBe(2)
  })
  it('flags missing code, missing name and bad numbers without silently fixing them', () => {
    const { valid, issues } = validateRows([{ name: 'x' }, { product_code: 'A1' }, { product_code: 'A2', name: 'n', pitch_mm: '25,4' }, { product_code: 'A3', name: 'n', source_page: '0' }])
    expect(valid).toHaveLength(0)
    expect(issues.map((i) => i.line)).toEqual([2, 3, 4, 5])
  })
  it('detects duplicate codes after normalisation and keeps the first', () => {
    const { valid, issues } = validateRows([{ product_code: 'ab-1', name: 'a' }, { product_code: 'AB 1', name: 'b' }])
    expect(valid).toHaveLength(1)
    expect(issues[0].message).toContain('line 2')
    expect(normaliseCode('ab-1')).toBe('AB1')
  })
  it('accepts header aliases', () => {
    expect(validateRows([{ 'Part Number': 'Z9', Name: 'n' }]).valid).toHaveLength(1)
  })
  it('chunks into batches and escapes the error CSV', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(issuesToCsv([{ line: 2, code: 'A"B', message: 'bad, row' }])).toBe('line,product_code,message\n2,"A""B","bad, row"')
  })
})
