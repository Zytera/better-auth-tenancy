import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { Invitation } from '../schema'
import type { ContextType } from '../types/context'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth, requireSession } from './middleware'
import {
  generateInvitationToken,
  generateInvitationCode,
  isValidInvitationCode,
  canUseInvitation,
  calculateExpirationDate,
} from '../utils/invitation-helper'

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
  expiresInHours?: number
  generateCode?: boolean
  metadata?: Record<string, unknown>
}

export const invitationEndpoints = (config?: TenancyConfig) => ({
  createInvitation: createAuthEndpoint(
    '/tenancy/invitation/create',
    {
      method: 'POST',
      body: z.object({
        identifier: z.string().optional(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        roleId: z.string().optional(),
        expiresInHours: z.number().optional(),
        generateCode: z.boolean().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create invitation',
          description: 'Create a flexible invitation (email/phone/link/QR) (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const invitedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.invitation?.create, ctx, session)

      const { identifier, contextType, contextId, roleId, expiresInHours, generateCode, metadata } = ctx.body

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

      const token = generateInvitationToken()
      const invitationCode = generateCode ? generateInvitationCode() : null

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
          expiresAt,
          metadata,
        },
      }) as Invitation

      const eventData = {
        invitationId: invitation.token,
        identifier: invitation.identifier || '',
        contextType: invitation.contextType,
        contextId: invitation.contextId,
        roleId: invitation.roleId ?? null,
        invitedBy: invitation.invitedBy,
        token: invitation.token,
        expiresAt: invitation.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        timestamp: new Date(),
      }

      // Execute action hook AFTER creating in DB (with rollback on error)
      if (config?.actions?.onInvitationCreated) {
        try {
          await config.actions.onInvitationCreated(eventData, ctx)
        } catch (error) {
          // Rollback: Delete the invitation that was just created
          await ctx.context.adapter.delete({
            model: 'invitation',
            where: [{ field: 'token', value: invitation.token }],
          })
          throw error
        }
      }

      // Audit hook runs AFTER successful creation (for logging only)
      if (config?.audit?.onInvitationCreated) {
        await config.audit.onInvitationCreated(eventData)
      }

      return ctx.json(invitation, { status: 201 })
    }
  ),

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
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.invitation?.getByToken, ctx, session)

      const { token: tokenParam } = ctx.params

      const invitation = await ctx.context.adapter.findOne({
        model: 'invitation',
        where: [{ field: 'token', value: tokenParam }],
      }) as Invitation | null

      if (!invitation) throw new APIError('NOT_FOUND', { message: 'Invitation not found' })

      const { token, ...safeInvitation } = invitation
      return ctx.json(safeInvitation)
    }
  ),

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
      const session = await getSessionFromCtx(ctx)
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

      const { token, ...safeInvitation } = invitation
      return ctx.json(safeInvitation)
    }
  ),

  acceptInvitation: createAuthEndpoint(
    '/tenancy/invitation/accept',
    {
      method: 'POST',
      body: z.object({
        token: z.string().optional(),
        invitationCode: z.string().optional(),
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
      await applyEndpointAuth(config?.endpoints?.invitation?.accept, ctx)

      const { token, invitationCode, metadata } = ctx.body

      if (!token && !invitationCode) {
        throw new APIError('BAD_REQUEST', { message: 'Either token or invitationCode must be provided' })
      }

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

      const canUse = canUseInvitation(invitation)
      if (!canUse.canUse) {
        throw new APIError('BAD_REQUEST', { message: canUse.reason || 'Cannot use invitation' })
      }

      const updated = await ctx.context.adapter.update({
        model: 'invitation',
        where: [{ field: 'token', value: invitation.token }],
        update: {
          status: 'accepted',
          acceptedAt: new Date(),
          metadata: metadata ? { ...invitation.metadata, ...metadata } : invitation.metadata,
        },
      }) as Invitation

      const eventData = {
        invitationId: invitation.token,
        identifier: invitation.identifier || '',
        contextType: invitation.contextType,
        contextId: invitation.contextId,
        roleId: invitation.roleId ?? null,
        timestamp: new Date(),
      }

      // Execute action hook AFTER updating status (with rollback on error)
      if (config?.actions?.onInvitationAccepted) {
        try {
          await config.actions.onInvitationAccepted(eventData, ctx)
        } catch (error) {
          // Rollback: Revert invitation status back to pending
          await ctx.context.adapter.update({
            model: 'invitation',
            where: [{ field: 'token', value: invitation.token }],
            update: {
              status: 'pending',
              acceptedAt: null,
            },
          })
          throw error
        }
      }

      // Audit hook runs AFTER successful acceptance (for logging only)
      if (config?.audit?.onInvitationAccepted) {
        await config.audit.onInvitationAccepted(eventData)
      }

      return ctx.json({ invitation: updated })
    }
  ),

  rejectInvitation: createAuthEndpoint(
    '/tenancy/invitation/reject',
    {
      method: 'POST',
      body: z.object({
        token: z.string().optional(),
        invitationCode: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Reject invitation',
          description: 'Reject/decline an invitation',
        },
      },
    },
    async (ctx) => {
      await applyEndpointAuth(config?.endpoints?.invitation?.decline, ctx)

      const { token, invitationCode } = ctx.body

      if (!token && !invitationCode) {
        throw new APIError('BAD_REQUEST', { message: 'Either token or invitationCode must be provided' })
      }

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

      const eventData = {
        invitationId: invitation.token,
        identifier: invitation.identifier || '',
        contextType: invitation.contextType,
        contextId: invitation.contextId,
        timestamp: new Date(),
      }

      // Execute action hook AFTER updating status (with rollback on error)
      if (config?.actions?.onInvitationRejected) {
        try {
          await config.actions.onInvitationRejected(eventData, ctx)
        } catch (error) {
          // Rollback: Revert invitation status back to pending
          await ctx.context.adapter.update({
            model: 'invitation',
            where: [{ field: 'token', value: invitation.token }],
            update: { status: 'pending' },
          })
          throw error
        }
      }

      // Audit hook runs AFTER successful rejection (for logging only)
      if (config?.audit?.onInvitationRejected) {
        await config.audit.onInvitationRejected(eventData)
      }

      return ctx.json(updated)
    }
  ),

  cancelInvitation: createAuthEndpoint(
    '/tenancy/invitation/cancel',
    {
      method: 'POST',
      body: z.object({
        token: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Cancel invitation',
          description: 'Cancel a pending invitation (admin action) (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const cancelledBy = session.user.id

      const { token } = ctx.body

      const resource = await findInvitationContext(ctx.context.adapter, token)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Invitation not found' })
      }

      await applyEndpointAuth(config?.endpoints?.invitation?.revoke, {
        ...ctx,
        resource,
      }, session)

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

      const eventData = {
        invitationId: invitation.token,
        identifier: invitation.identifier || '',
        contextType: resource.contextType,
        contextId: resource.contextId,
        cancelledBy,
        timestamp: new Date(),
      }

      // Execute action hook AFTER updating status (with rollback on error)
      if (config?.actions?.onInvitationCancelled) {
        try {
          await config.actions.onInvitationCancelled(eventData, ctx)
        } catch (error) {
          // Rollback: Revert invitation status back to pending
          await ctx.context.adapter.update({
            model: 'invitation',
            where: [{ field: 'token', value: token }],
            update: {
              status: 'pending',
              cancelledAt: null,
            },
          })
          throw error
        }
      }

      // Audit hook runs AFTER successful cancellation (for logging only)
      if (config?.audit?.onInvitationCancelled) {
        await config.audit.onInvitationCancelled(eventData)
      }

      return ctx.json(updated)
    }
  ),

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
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.invitation?.list, ctx, session)

      const { contextType, contextId, status, limit = 50, offset = 0 } = ctx.query

      const where: Array<{ field: string; value: string }> = [
        { field: 'contextType', value: contextType },
        { field: 'contextId', value: contextId },
      ]
      if (status) {
        where.push({ field: 'status', value: status })
      }

      let items = await ctx.context.adapter.findMany({
        model: 'invitation',
        where,
      }) as Invitation[]

      const total = items.length
      items = items.slice(offset, offset + limit)

      const safeItems = items.map(({ token, ...item }) => item)

      return ctx.json({ items: safeItems, total, limit, offset })
    }
  ),

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
      const session = await getSessionFromCtx(ctx)
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

      const safeInvitations = invitations.map(({ token, ...inv }) => inv)

      return ctx.json(safeInvitations)
    }
  ),

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
      await applyEndpointAuth(config?.endpoints?.invitation?.cleanupExpired, ctx)

      const allInvitations = await ctx.context.adapter.findMany({
        model: 'invitation',
      }) as Invitation[]
      const now = new Date()
      const expired = allInvitations.filter((inv) =>
        inv.status === 'pending' && inv.expiresAt != null && inv.expiresAt < now
      )

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
