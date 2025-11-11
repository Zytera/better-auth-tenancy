import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { Invitation } from '../schema'
import type { ContextType } from '../types/context'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth } from './middleware'
import { _addMember } from './members'
import {
  generateInvitationToken,
  generateInvitationCode,
  isValidInvitationCode,
  canUseInvitation,
  calculateExpirationDate,
} from '../utils/invitation-helper'

/**
 * Find invitation and determine its context
 * This helper is used to enrich endpoint hooks with resource context
 */
export async function findInvitationContext(
  adapter: Adapter,
  token: string
): Promise<ResourceContext | null> {
  const invitation = await adapter.findOne({
    model: 'invitation',
    where: [{ field: 'token', value: token }],
  }).catch(() => null) as Invitation | null

  if (invitation) {
    return {
      contextType: invitation.contextType,
      contextId: invitation.contextId,
      data: invitation,
    }
  }

  return null
}

export interface CreateInvitationInput {
  identifier?: string
  contextType: ContextType
  contextId: string
  roleId?: string
  invitedBy: string
  expiresInHours?: number
  generateCode?: boolean
  maxUses?: number
  metadata?: Record<string, unknown>
}

export const invitationEndpoints = (config?: TenancyConfig) => ({
  /**
   * Create a new invitation
   * Flexible: can be used for email, phone, username, or anonymous invitations
   */
  createInvitation: createAuthEndpoint(
    '/tenancy/invitation/create',
    {
      method: 'POST',
      body: z.object({
        identifier: z.string().optional(), // Flexible: email, phone, username, etc.
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        roleId: z.string().optional(),
        invitedBy: z.string(),
        expiresInHours: z.number().optional(), // undefined = never expires
        generateCode: z.boolean().optional(), // Generate short code
        maxUses: z.number().int().positive().optional(), // For multi-use invitations
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create invitation',
          description: 'Create a flexible invitation (email/phone/link/QR)',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.create, ctx)

      const { identifier, contextType, contextId, roleId, invitedBy, expiresInHours, generateCode, maxUses, metadata } = ctx.body

      // Check for existing pending invitation (only if identifier provided)
      if (identifier) {
        const allInvitations = await ctx.context.adapter.findMany({
          model: 'invitation',
          where: [
            { field: 'identifier', value: identifier },
            { field: 'status', value: 'pending' },
          ],
        }) as Invitation[]
        const hasPending = allInvitations.some(
          (inv) => inv.contextType === contextType && inv.contextId === contextId
        )
        if (hasPending) {
          throw new APIError('BAD_REQUEST', { message: `Pending invitation already exists for ${identifier}` })
        }
      }

      // Generate tokens
      const token = generateInvitationToken()
      const invitationCode = generateCode ? generateInvitationCode() : null

      // Calculate expiration (undefined = never expires)
      const expiresAt = calculateExpirationDate(
        expiresInHours === undefined ? undefined : (expiresInHours || config?.invitation?.defaultExpirationHours || 72)
      )

      const invitation = await ctx.context.adapter.create({
        model: 'invitation',
        data: {
          token,
          invitationCode,
          identifier: identifier || null,
          contextType,
          contextId,
          roleId: roleId || null,
          invitedBy,
          status: 'pending',
          maxUses: maxUses || null,
          usedCount: 0,
          expiresAt,
          metadata,
        },
      }) as Invitation

      if (config?.audit?.onInvitationCreated) {
        await config.audit.onInvitationCreated({
          invitationId: invitation.token,
          email: invitation.identifier || '',
          contextType: invitation.contextType,
          contextId: invitation.contextId,
          roleId: invitation.roleId ?? null,
          invitedBy: invitation.invitedBy,
          token: invitation.token,
          expiresAt: invitation.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year fallback for audit
          timestamp: new Date(),
        })
      }

      return ctx.json(invitation, { status: 201 })
    }
  ),

  /**
   * Get invitation by token
   */
  getInvitationByToken: createAuthEndpoint(
    '/tenancy/invitation/by-token/:token',
    {
      method: 'GET',
      params: z.object({
        token: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get invitation by token',
          description: 'Get invitation details by token (for links/QR)',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.getByToken, ctx, session)

      const { token: tokenParam } = ctx.params

      const invitation = await ctx.context.adapter.findOne({
        model: 'invitation',
        where: [{ field: 'token', value: tokenParam }],
      }) as Invitation | null

      if (!invitation) throw new APIError('NOT_FOUND', { message: 'Invitation not found' })

      // Return without sensitive token in response
      const { token, ...safeInvitation } = invitation
      return ctx.json(safeInvitation)
    }
  ),

  /**
   * Get invitation by short code
   */
  getInvitationByCode: createAuthEndpoint(
    '/tenancy/invitation/by-code/:code',
    {
      method: 'GET',
      params: z.object({
        code: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get invitation by code',
          description: 'Get invitation details by short code',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.getByToken, ctx, session)

      const code = ctx.params.code.toUpperCase()

      if (!isValidInvitationCode(code)) {
        throw new APIError('BAD_REQUEST', { message: 'Invalid invitation code format' })
      }

      const invitation = await ctx.context.adapter.findOne({
        model: 'invitation',
        where: [{ field: 'invitationCode', value: code }],
      }) as Invitation | null

      if (!invitation) throw new APIError('NOT_FOUND', { message: 'Invitation not found' })

      // Return without sensitive token
      const { token, ...safeInvitation } = invitation
      return ctx.json(safeInvitation)
    }
  ),

  /**
   * Accept invitation - flexible acceptance (by token or code)
   */
  acceptInvitation: createAuthEndpoint(
    '/tenancy/invitation/accept',
    {
      method: 'POST',
      body: z.object({
        token: z.string().optional(),
        invitationCode: z.string().optional(),
        userId: z.string(),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Accept invitation',
          description: 'Accept invitation by token or code',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.accept, ctx)

      const { token, invitationCode, userId, metadata } = ctx.body

      if (!token && !invitationCode) {
        throw new APIError('BAD_REQUEST', { message: 'Either token or invitationCode must be provided' })
      }

      // Find invitation
      let invitation: Invitation | null = null
      if (token) {
        invitation = await ctx.context.adapter.findOne({
          model: 'invitation',
          where: [{ field: 'token', value: token }],
        }) as Invitation | null
      } else if (invitationCode) {
        const code = invitationCode.toUpperCase()
        if (!isValidInvitationCode(code)) {
          throw new APIError('BAD_REQUEST', { message: 'Invalid invitation code format' })
        }
        invitation = await ctx.context.adapter.findOne({
          model: 'invitation',
          where: [{ field: 'invitationCode', value: code }],
        }) as Invitation | null
      }

      if (!invitation) throw new APIError('NOT_FOUND', { message: 'Invalid invitation' })

      // Check if invitation can be used
      const canUse = canUseInvitation(invitation)
      if (!canUse.canUse) {
        throw new APIError('BAD_REQUEST', { message: canUse.reason || 'Cannot use invitation' })
      }

      // Add user as member
      const member = await _addMember(
        ctx.context.adapter,
        {
          userId,
          contextType: invitation.contextType,
          contextId: invitation.contextId,
          roleId: invitation.roleId || undefined,
          _addedBy: invitation.invitedBy,
        },
        config
      )

      // Update invitation
      const isFirstUse = invitation.usedCount === 0
      const newUsedCount = invitation.usedCount + 1
      const shouldMarkAccepted = invitation.maxUses == null || newUsedCount >= invitation.maxUses

      const updated = await ctx.context.adapter.update({
        model: 'invitation',
        where: [{ field: 'token', value: invitation.token }],
        update: {
          status: shouldMarkAccepted ? 'accepted' : 'pending',
          usedCount: newUsedCount,
          acceptedAt: isFirstUse ? new Date() : invitation.acceptedAt,
          metadata: metadata ? { ...invitation.metadata, ...metadata } : invitation.metadata,
        },
      }) as Invitation

      if (config?.audit?.onInvitationAccepted) {
        await config.audit.onInvitationAccepted({
          invitationId: invitation.token,
          email: invitation.identifier || '',
          userId,
          contextType: invitation.contextType,
          contextId: invitation.contextId,
          roleId: invitation.roleId ?? null,
          timestamp: new Date(),
        })
      }

      return ctx.json({ invitation: updated, memberId: member.id })
    }
  ),

  /**
   * Reject/decline invitation
   */
  rejectInvitation: createAuthEndpoint(
    '/tenancy/invitation/reject',
    {
      method: 'POST',
      body: z.object({
        token: z.string().optional(),
        invitationCode: z.string().optional(),
        userId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Reject invitation',
          description: 'Reject/decline an invitation',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.decline, ctx)

      const { token, invitationCode } = ctx.body

      if (!token && !invitationCode) {
        throw new APIError('BAD_REQUEST', { message: 'Either token or invitationCode must be provided' })
      }

      // Find invitation
      let invitation: Invitation | null = null
      if (token) {
        invitation = await ctx.context.adapter.findOne({
          model: 'invitation',
          where: [{ field: 'token', value: token }],
        }) as Invitation | null
      } else if (invitationCode) {
        invitation = await ctx.context.adapter.findOne({
          model: 'invitation',
          where: [{ field: 'invitationCode', value: invitationCode.toUpperCase() }],
        }) as Invitation | null
      }

      if (!invitation) throw new APIError('NOT_FOUND', { message: 'Invalid invitation' })
      if (invitation.status !== 'pending') {
        throw new APIError('BAD_REQUEST', { message: `Invitation is ${invitation.status}` })
      }

      const updated = await ctx.context.adapter.update({
        model: 'invitation',
        where: [{ field: 'token', value: invitation.token }],
        update: { status: 'rejected' },
      }) as Invitation

      if (config?.audit?.onInvitationRejected) {
        await config.audit.onInvitationRejected({
          invitationId: invitation.token,
          email: invitation.identifier || '',
          contextType: invitation.contextType,
          contextId: invitation.contextId,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  /**
   * Cancel invitation (by admin/inviter)
   */
  cancelInvitation: createAuthEndpoint(
    '/tenancy/invitation/cancel',
    {
      method: 'POST',
      body: z.object({
        token: z.string(),
        cancelledBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Cancel invitation',
          description: 'Cancel a pending invitation (admin action)',
        },
      },
    },
    async (ctx) => {
      const { token, cancelledBy } = ctx.body

      // Find invitation and enrich context BEFORE calling hook
      const resource = await findInvitationContext(ctx.context.adapter, token)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Invitation not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.invitation?.revoke, {
        ...ctx,
        resource,
      })

      const invitation = resource.data as Invitation
      if (invitation.status !== 'pending') {
        throw new APIError('BAD_REQUEST', { message: `Invitation is ${invitation.status}` })
      }

      const updated = await ctx.context.adapter.update({
        model: 'invitation',
        where: [{ field: 'token', value: token }],
        update: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      }) as Invitation

      if (config?.audit?.onInvitationCancelled) {
        await config.audit.onInvitationCancelled({
          invitationId: invitation.token,
          email: invitation.identifier || '',
          contextType: resource.contextType,
          contextId: resource.contextId,
          cancelledBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  /**
   * List invitations for a context
   */
  listInvitations: createAuthEndpoint(
    '/tenancy/invitation/list',
    {
      method: 'GET',
      query: z.object({
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        status: z.string().optional(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List invitations',
          description: 'List all invitations for a context',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.list, ctx, session)

      const { contextType, contextId, status, limit = 50, offset = 0 } = ctx.query

      const where: Array<{ field: string; value: string }> = [
        { field: 'contextType', value: contextType },
        { field: 'contextId', value: contextId },
      ]
      if (status) {
        where.push({ field: 'status', value: status })
      }

      // Get all items first
      let items = await ctx.context.adapter.findMany({
        model: 'invitation',
        where,
      }) as Invitation[]

      const total = items.length

      // Apply pagination after filtering
      items = items.slice(offset, offset + limit)

      // Remove sensitive tokens from list
      const safeItems = items.map(({ token, ...item }) => item)

      return ctx.json({ items: safeItems, total, limit, offset })
    }
  ),

  /**
   * Get invitations by identifier (email/phone/username)
   */
  getInvitationsByIdentifier: createAuthEndpoint(
    '/tenancy/invitation/by-identifier',
    {
      method: 'GET',
      query: z.object({
        identifier: z.string(),
        status: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Get invitations by identifier',
          description: 'Get all invitations for an identifier (email/phone/etc)',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.list, ctx, session)

      const { identifier, status } = ctx.query

      const where: Array<{ field: string; value: string }> = [{ field: 'identifier', value: identifier }]
      if (status) {
        where.push({ field: 'status', value: status })
      }

      const invitations = await ctx.context.adapter.findMany({
        model: 'invitation',
        where,
      }) as Invitation[]

      // Remove sensitive tokens
      const safeInvitations = invitations.map(({ token, ...inv }) => inv)

      return ctx.json(safeInvitations)
    }
  ),

  /**
   * Cleanup expired invitations (cron job)
   */
  cleanupExpiredInvitations: createAuthEndpoint(
    '/tenancy/invitation/cleanup-expired',
    {
      method: 'POST',
      metadata: {
        openapi: {
          summary: 'Cleanup expired invitations',
          description: 'Mark expired invitations as expired (cron job)',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.invitation?.cleanupExpired, ctx)

      const allInvitations = await ctx.context.adapter.findMany({
        model: 'invitation',
      }) as Invitation[]
      const now = new Date()
      const expired = allInvitations.filter((inv) =>
        inv.status === 'pending' && inv.expiresAt != null && inv.expiresAt < now
      )

      // Update them to expired status
      for (const inv of expired) {
        await ctx.context.adapter.update({
          model: 'invitation',
          where: [{ field: 'token', value: inv.token }],
          update: { status: 'expired' },
        })
      }

      return ctx.json({ expiredCount: expired.length })
    }
  ),
})
