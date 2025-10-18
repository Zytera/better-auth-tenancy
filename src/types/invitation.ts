import type { ContextType } from './context'

/**
 * Invitation status
 */
export type InvitationStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired'

/**
 * Invitation with full details
 */
export interface InvitationWithDetails {
  token: string // Primary identifier
  invitationCode: string | null // Short code for manual entry
  identifier: string | null // Flexible: email, phone, username, etc.
  contextType: ContextType
  contextId: string
  contextName?: string // Populated from join
  roleId: string | null
  roleName?: string // Populated from join
  invitedBy: string
  invitedByName?: string // Populated from join
  status: InvitationStatus
  maxUses: number | null // null = single use
  usedCount: number
  expiresAt: Date | null // null = never expires
  createdAt: Date
  acceptedAt: Date | null
  cancelledAt: Date | null
  metadata: Record<string, unknown> | null
}

/**
 * Invitation summary (without sensitive token)
 */
export interface InvitationSummary {
  invitationCode: string | null
  identifier: string | null
  contextType: ContextType
  contextId: string
  contextName?: string
  roleId: string | null
  roleName?: string
  status: InvitationStatus
  invitedBy: string
  invitedByName?: string
  maxUses: number | null
  usedCount: number
  expiresAt: Date | null
  createdAt: Date
}

/**
 * Create invitation input
 */
export interface CreateInvitationInput {
  identifier?: string // Optional: email, phone, username, etc.
  contextType: ContextType
  contextId: string
  roleId?: string
  invitedBy: string
  expiresInHours?: number // undefined = never expires, 0 = config default
  generateCode?: boolean // Generate short invitation code
  maxUses?: number // For multi-use invitations (team join links)
  metadata?: Record<string, unknown> // Custom data
}

/**
 * Accept invitation input - flexible acceptance methods
 */
export interface AcceptInvitationInput {
  // Accept by token (from link/QR)
  token?: string
  // OR accept by short code (typed manually)
  invitationCode?: string
  // User accepting the invitation
  userId: string
  // Optional: additional metadata about acceptance
  metadata?: Record<string, unknown>
}

/**
 * Reject invitation input
 */
export interface RejectInvitationInput {
  token?: string
  invitationCode?: string
  userId: string
}

/**
 * Cancel invitation input
 */
export interface CancelInvitationInput {
  token: string
  cancelledBy: string
}

/**
 * Invitation validation result
 */
export interface InvitationValidation {
  isValid: boolean
  error?: string
  invitation?: InvitationWithDetails
  canAccept: boolean // Checks expiration, maxUses, status
}

/**
 * Invitation query options
 */
export interface InvitationQueryOptions {
  contextType?: ContextType
  contextId?: string
  identifier?: string
  status?: InvitationStatus | InvitationStatus[]
  includeExpired?: boolean
  limit?: number
  offset?: number
  orderBy?: 'createdAt' | 'expiresAt'
  orderDirection?: 'asc' | 'desc'
}

/**
 * Invitation statistics
 */
export interface InvitationStatistics {
  total: number
  pending: number
  accepted: number
  rejected: number
  expired: number
  cancelled: number
  multiUse: number // Invitations with maxUses > 1
}

/**
 * Bulk invitation input - for inviting multiple people at once
 */
export interface BulkInvitationInput {
  identifiers: string[] // Array of emails, phones, etc.
  contextType: ContextType
  contextId: string
  roleId?: string
  invitedBy: string
  expiresInHours?: number
  metadata?: Record<string, unknown>
}

/**
 * Bulk invitation result
 */
export interface BulkInvitationResult {
  successful: Array<{
    identifier: string
    token: string
    invitationCode: string | null
  }>
  failed: Array<{
    identifier: string
    error: string
  }>
  statistics: {
    total: number
    successful: number
    failed: number
  }
}
