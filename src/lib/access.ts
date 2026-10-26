export type AccessStatus =
  | 'invited'
  | 'pending_verification'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'suspended'

export const STATUS_LABEL: Record<AccessStatus, string> = {
  invited: 'Invited',
  pending_verification: 'Pending verification',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  rejected: 'Rejected',
  suspended: 'Suspended',
}

/**
 * UX-only gate. Real enforcement is server-side (Supabase RLS, Phase 2).
 * Access requires: signed in AND email verified AND status === 'approved'.
 */
export function canAccessProtected(signedIn: boolean, emailVerified: boolean, status: AccessStatus): boolean {
  return signedIn && emailVerified && status === 'approved'
}

export function routeForStatus(status: AccessStatus): string {
  if (status === 'approved') return '/'
  if (status === 'rejected' || status === 'suspended') return '/denied'
  return '/pending'
}

/** Fallback when no server record exists yet. Never returns 'approved'. */
export function fallbackStatus(emailVerified: boolean): AccessStatus {
  return emailVerified ? 'pending_approval' : 'pending_verification'
}

export type AppRole = 'super_admin' | 'admin' | 'approved_user'
export type AdminAction = 'approve' | 'reject' | 'suspend' | 'reactivate'

/** Which buttons to show. UX only: the database re-checks every action. */
export function availableActions(status: AccessStatus, callerRole: AppRole | null, targetRole: AppRole | null): AdminAction[] {
  if ((targetRole === 'admin' || targetRole === 'super_admin') && callerRole !== 'super_admin') return []
  switch (status) {
    case 'pending_approval': return ['approve', 'reject']
    case 'rejected': return ['approve']
    case 'approved': return ['suspend']
    case 'suspended': return ['reactivate']
    default: return []
  }
}
