import { describe, expect, it } from 'vitest'
import { availableActions } from '../src/lib/access'

describe('availableActions (UX hints; server re-checks)', () => {
  it('offers approve/reject for pending users', () => {
    expect(availableActions('pending_approval', 'admin', null)).toEqual(['approve', 'reject'])
  })
  it('hides all actions on administrators unless caller is Super Admin', () => {
    expect(availableActions('approved', 'admin', 'admin')).toEqual([])
    expect(availableActions('approved', 'admin', 'super_admin')).toEqual([])
    expect(availableActions('approved', 'super_admin', 'admin')).toEqual(['suspend'])
  })
  it('offers reactivate only for suspended users', () => {
    expect(availableActions('suspended', 'super_admin', 'approved_user')).toEqual(['reactivate'])
    expect(availableActions('pending_verification', 'super_admin', null)).toEqual([])
  })
})
