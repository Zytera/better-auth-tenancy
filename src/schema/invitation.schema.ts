import * as z from 'zod'

/**
 * Invitation Status - Tracks the lifecycle of an invitation
 */
export const invitationStatuses = ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] as const
export const invitationStatusSchema = z.enum(invitationStatuses)
export type InvitationStatus = z.infer<typeof invitationStatusSchema>

/**
 * Context Type for invitations (same as permissions)
 */
export const invitationContextTypes = ['organization', 'team', 'subteam'] as const
export const invitationContextTypeSchema = z.enum(invitationContextTypes)
export type InvitationContextType = z.infer<typeof invitationContextTypeSchema>

/**
 * Invitation schema - Flexible invitation system for multi-tenant contexts
 *
 * Key Features:
 * - Notification-agnostic: `identifier` can be email, phone, username, or any contact method
 * - Shareable: Generate links or QR codes using the `token` or short `invitationCode`
 * - Audit-only: Plugin doesn't send notifications - that's your responsibility via hooks
 * - Flexible acceptance: Accept by token, code, or QR scan
 *
 * Use Cases:
 * 1. Email/SMS: Create invitation, get token, send via your preferred service
 * 2. Share link: User copies link with token and shares via WhatsApp/Slack/etc
 * 3. QR code: Admin scans invitee's QR code for instant in-person onboarding
 * 4. Short code: User types short code like "ABC123" to join
 */
export const invitationSchema = z.object({
  /**
   * Unique token - primary identifier for the invitation
   * Use this to generate shareable links: https://app.com/join/{token}
   */
  token: z.string(),

  /**
   * Short invitation code (6-8 chars) for easy manual entry
   * Example: "ABC123" - user can type this to join
   * Optional: only generated if requested
   */
  invitationCode: z.string().nullish(),

  /**
   * Flexible identifier - NOT just email!
   * Can be: email, phone, username, user ID, or any contact method
   * Used for audit/tracking only - plugin doesn't send notifications
   */
  identifier: z.string().nullish(),

  /**
   * Context information
   */
  contextType: invitationContextTypeSchema,
  contextId: z.string(), // References organization, team, or subteam ID
  roleId: z.string().nullish(), // Role to assign when accepted

  /**
   * Invitation metadata
   */
  invitedBy: z.string(), // User ID who created the invitation
  status: invitationStatusSchema.default('pending'),

  /**
   * Optional: Maximum number of times this invitation can be used
   * Useful for creating "team join links" that multiple people can use
   * null = single use (default)
   */
  maxUses: z.number().int().positive().nullish(),
  usedCount: z.number().int().default(0),

  /**
   * Timestamps
   */
  expiresAt: z.date().nullish(), // null = never expires
  createdAt: z.date().default(() => new Date()),
  acceptedAt: z.date().nullish(), // First acceptance time
  cancelledAt: z.date().nullish(),

  /**
   * Flexible metadata for custom use cases
   * Examples:
   * - { notificationMethod: 'whatsapp', sentAt: '2024-01-01' }
   * - { qrScanned: true, deviceInfo: {...} }
   * - { referralSource: 'employee', department: 'engineering' }
   */
  metadata: z.record(z.unknown()).nullish(),
})

export type Invitation = z.infer<typeof invitationSchema>
