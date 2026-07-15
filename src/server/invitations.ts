import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { Invitation } from '../schema'
import type { ContextType } from '../types/context'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth, requireSession, requireSelfOr } from './middleware'
import {
  generateInvitationToken,
  generateInvitationCode,
  isValidInvitationCode,
  canUseInvitation,
  calculateExpirationDate,
} from '../utils/invitation-helper'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'

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

export async function findInvitationContextById(
  adapter: Adapter,
  id: string
): Promise<ResourceContext | null> {
  const invitation = await adapter.findOne({
    model: 'invitation',
    where: [{ field: 'id', value: id }],
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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        roleId: z.string().optional(),
        expiresInHours: z.number().optional(),
        generateCode: z.boolean().optional(),
        metadata: config?.schemas?.invitation?.metadata ?? z.record(z.string(), z.unknown()).optional(),
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

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: invitation.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (invitation.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: invitation.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token: _, invitedBy: __, roleId: ___, ...safeInvitation } = invitation

      return ctx.json({
        ...safeInvitation,
        invitedByUser: invitedByUser ? {
          id: invitedByUser.id,
          name: invitedByUser.name,
          image: invitedByUser.image,
        } : null,
        role: role ? {
          id: role.id,
          name: role.name,
          description: role.description,
        } : null,
      }, { status: 201 })
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

      if (!invitation) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('invitation.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: invitation.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (invitation.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: invitation.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token, invitedBy, roleId, ...safeInvitation } = invitation

      return ctx.json({
        ...safeInvitation,
        invitedByUser: invitedByUser ? {
          id: invitedByUser.id,
          name: invitedByUser.name,
          image: invitedByUser.image,
        } : null,
        role: role ? {
          id: role.id,
          name: role.name,
          description: role.description,
        } : null,
      })
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

      if (!invitation) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('invitation.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: invitation.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (invitation.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: invitation.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token, invitedBy, roleId, ...safeInvitation } = invitation

      return ctx.json({
        ...safeInvitation,
        invitedByUser: invitedByUser ? {
          id: invitedByUser.id,
          name: invitedByUser.name,
          image: invitedByUser.image,
        } : null,
        role: role ? {
          id: role.id,
          name: role.name,
          description: role.description,
        } : null,
      })
    }
  ),

  acceptInvitation: createAuthEndpoint(
    '/tenancy/invitation/accept',
    {
      method: 'POST',
      body: z.object({
        token: z.string().optional(),
        invitationCode: z.string().optional(),
        metadata: config?.schemas?.invitation?.metadata?.optional() ?? z.record(z.string(), z.unknown()).optional(),
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

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: updated.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (updated.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: updated.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token: _token, invitedBy, roleId: _roleId, ...safeInvitation } = updated

      return ctx.json({
        invitation: {
          ...safeInvitation,
          invitedByUser: invitedByUser ? {
            id: invitedByUser.id,
            name: invitedByUser.name,
              image: invitedByUser.image,
          } : null,
          role: role ? {
            id: role.id,
            name: role.name,
            description: role.description,
          } : null,
        }
      })
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

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: updated.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (updated.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: updated.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token: _token, invitedBy, roleId: _roleId, ...safeInvitation } = updated

      return ctx.json({
        ...safeInvitation,
        invitedByUser: invitedByUser ? {
          id: invitedByUser.id,
          name: invitedByUser.name,
          image: invitedByUser.image,
        } : null,
        role: role ? {
          id: role.id,
          name: role.name,
          description: role.description,
        } : null,
      })
    }
  ),

  cancelInvitation: createAuthEndpoint(
    '/tenancy/invitation/cancel',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
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

      const { id } = ctx.body

      const resource = await findInvitationContextById(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('invitation.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
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
        where: [{ field: 'id', value: id }],
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
            where: [{ field: 'id', value: id }],
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

      // Enrich with user and role data for consistent response
      const invitedByUser = await ctx.context.adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: updated.invitedBy }],
      }).catch(() => null) as any

      let role = null
      if (updated.roleId) {
        role = await ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: updated.roleId }],
        }).catch(() => null) as any
      }

      // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
      const { token, invitedBy, roleId, ...safeInvitation } = updated

      return ctx.json({
        ...safeInvitation,
        invitedByUser: invitedByUser ? {
          id: invitedByUser.id,
          name: invitedByUser.name,
          image: invitedByUser.image,
        } : null,
        role: role ? {
          id: role.id,
          name: role.name,
          description: role.description,
        } : null,
      })
    }
  ),

  listInvitations: createAuthEndpoint(
    '/tenancy/invitation/list',
    {
      method: 'GET',
      query: z.object({
        contextType: z.enum(['organization', 'team']),
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

      // Execute findMany and count in parallel for better performance
      const [items, total] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'invitation',
          where,
          limit,
          offset,
        }) as Promise<Invitation[]>,
        ctx.context.adapter.count({
          model: 'invitation',
          where,
        })
      ])

      // Batch fetch users and roles for better performance (avoid N+1 queries)
      const invitedByUserIds = [...new Set(items.map(i => i.invitedBy))]
      const roleIds = [...new Set(items.map(i => i.roleId).filter(Boolean))] as string[]

      // Fetch all invitedBy users in batch
      const usersPromises = invitedByUserIds.map(userId =>
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        }).catch(() => null)
      )
      const users = await Promise.all(usersPromises) as any[]
      const userMap = new Map(users.filter(Boolean).map(u => [u.id, u]))

      // Fetch all roles in batch
      const rolesPromises = roleIds.map(roleId =>
        ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: roleId }],
        }).catch(() => null)
      )
      const roles = await Promise.all(rolesPromises) as any[]
      const roleMap = new Map(roles.filter(Boolean).map(r => [r.id, r]))

      // Enrich invitations with cached user and role data
      const enrichedItems = items.map((invitation) => {
        const invitedByUser = userMap.get(invitation.invitedBy)
        const role = invitation.roleId ? roleMap.get(invitation.roleId) : null

        // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
        const { token, invitedBy, roleId, ...safeInvitation } = invitation

        return {
          ...safeInvitation,
          invitedByUser: invitedByUser ? {
            id: invitedByUser.id,
            name: invitedByUser.name,
              image: invitedByUser.image,
          } : null,
          role: role ? {
            id: role.id,
            name: role.name,
            description: role.description,
          } : null,
        }
      })

      return ctx.json({ items: enrichedItems, total, limit, offset })
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
      const session = await requireSession(ctx)
      const { identifier, status } = ctx.query

      // Identifier lookup: own identifier by default, hook is the admin override.
      // identifier is opaque (email/phone/etc); match against the user's known
      // contact fields (phoneNumber comes from Better Auth's phoneNumber plugin).
      const u = session.user as { email?: string; phoneNumber?: string }
      const isSelf = !!identifier && (identifier === u.email || identifier === u.phoneNumber)
      await requireSelfOr(isSelf, config?.endpoints?.invitation?.getByIdentifier, ctx, session)

      const where: Array<{ field: string; value: string }> = [{ field: 'identifier', value: identifier }]
      if (status) {
        where.push({ field: 'status', value: status })
      }

      const invitations = await ctx.context.adapter.findMany({
        model: 'invitation',
        where,
      }) as Invitation[]

      // Batch fetch users and roles for better performance (avoid N+1 queries)
      const invitedByUserIds = [...new Set(invitations.map(i => i.invitedBy))]

      // Fetch all invitedBy users in batch
      const usersPromises = invitedByUserIds.map(userId =>
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        }).catch(() => null)
      )
      const users = await Promise.all(usersPromises) as any[]
      const userMap = new Map(users.filter(Boolean).map(u => [u.id, u]))

      // Fetch all roles in batch using unified model
      const allRoleIds = [...new Set(invitations.map(i => i.roleId).filter(Boolean))] as string[]
      const roleMap = new Map()
      if (allRoleIds.length > 0) {
        const rolesPromises = allRoleIds.map(roleId =>
          ctx.context.adapter.findOne({
            model: 'role',
            where: [{ field: 'id', value: roleId }],
          }).catch(() => null)
        )
        const roles = await Promise.all(rolesPromises) as any[]
        roles.filter(Boolean).forEach(r => roleMap.set(r.id, r))
      }

      // Enrich invitations with cached user and role data
      const enrichedInvitations = invitations.map((invitation) => {
        const invitedByUser = userMap.get(invitation.invitedBy)
        const role = invitation.roleId ? roleMap.get(invitation.roleId) : null

        // Remove duplicate fields (token, invitedBy, roleId) - keep only enriched objects
        const { token, invitedBy, roleId, ...safeInvitation } = invitation

        return {
          ...safeInvitation,
          invitedByUser: invitedByUser ? {
            id: invitedByUser.id,
            name: invitedByUser.name,
              image: invitedByUser.image,
          } : null,
          role: role ? {
            id: role.id,
            name: role.name,
            description: role.description,
          } : null,
        }
      })

      return ctx.json(enrichedInvitations)
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
