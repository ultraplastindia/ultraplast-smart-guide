import { describe, expect, it } from 'vitest'
import { canAccessProtected, fallbackStatus, routeForStatus, type AccessStatus } from '../src/lib/access'

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
