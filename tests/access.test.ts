import { describe, expect, it } from 'vitest'
import { canAccessProtected, fallbackStatus, routeForStatus, type AccessStatus, PANELS, canSeePanel } from '../src/lib/access'

const ALL: AccessStatus[] = ['invited', 'pending_verification', 'pending_approval', 'approved', 'rejected', 'suspended']

describe('access gate', () => {
  it('allows only signed-in, verified, approved users', () => {
    for (const s of ALL) expect(canAccessProtected(true, true, s)).toBe(s === 'approved')
  })
  it('denies approved status without verification or session', () => {
    expect(canAccessProtected(true, false, 'approved')).toBe(false)
    expect(canAccessProtected(false, true, 'approved')).toBe(false)
  })
  it('fallback status is never approved', () => {
    expect(fallbackStatus(true)).toBe('pending_approval')
    expect(fallbackStatus(false)).toBe('pending_verification')
  })
  it('routes rejected and suspended to denied', () => {
    expect(routeForStatus('rejected')).toBe('/denied')
    expect(routeForStatus('suspended')).toBe('/denied')
    expect(routeForStatus('pending_approval')).toBe('/pending')
  })
})

describe('panel access', () => {
  it('shows every panel when no panel role is assigned', () => {
    expect(canSeePanel(null, 'approved_user', 'guide')).toBe(true)
    expect(canSeePanel(null, 'approved_user', 'admin')).toBe(true)
  })
  it('shows only the panels of the assigned role', () => {
    expect(canSeePanel(['guide', 'help'], 'approved_user', 'guide')).toBe(true)
    expect(canSeePanel(['guide', 'help'], 'approved_user', 'catalogue')).toBe(false)
    expect(canSeePanel([], 'approved_user', 'guide')).toBe(false)
  })
  it('always shows every panel to a Super Admin', () => {
    expect(canSeePanel(['guide'], 'super_admin', 'admin')).toBe(true)
  })
  it('lists each panel once, with its address', () => {
    const keys = PANELS.map(([k]) => k)
    expect(new Set(keys).size).toBe(keys.length)
    expect(PANELS.find(([k]) => k === 'guide')?.[2]).toBe('/guide')
  })
})
