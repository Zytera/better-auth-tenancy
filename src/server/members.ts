import { z } from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { OrganizationMember, TeamMember, SubteamMember } from '../schema'
import type { ContextType } from '../types/context'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth, requireSession } from './middleware'

export type Member = OrganizationMember | TeamMember | SubteamMember

/**
 * Find member and determine its context (organization, team, or subteam)
 * This helper is used to enrich endpoint hooks with resource context
 */
export async function findMemberContext(
  adapter: Adapter,
  memberId: string
): Promise<ResourceContext | null> {
  // Try organizationMember
  const orgMember = await adapter.findOne({
    model: 'organizationMember',
    where: [{ field: 'id', value: memberId }],
  }).catch(() => null) as OrganizationMember | null

  if (orgMember) {
    return {
      contextType: 'organization',
      contextId: orgMember.organizationId,
      data: orgMember,
    }
  }

  // Try teamMember
  const teamMember = await adapter.findOne({
    model: 'teamMember',
    where: [{ field: 'id', value: memberId }],
  }).catch(() => null) as TeamMember | null

  if (teamMember) {
    return {
      contextType: 'team',
      contextId: teamMember.teamId,
      data: teamMember,
    }
  }

  // Try subteamMember
  const subteamMember = await adapter.findOne({
    model: 'subteamMember',
    where: [{ field: 'id', value: memberId }],
  }).catch(() => null) as SubteamMember | null

  if (subteamMember) {
    return {
      contextType: 'subteam',
      contextId: subteamMember.subteamId,
      data: subteamMember,
    }
  }

  return null
}

export interface AddMemberInput {
  userId: string
  contextType: ContextType
  contextId: string
  roleId?: string
  metadata?: Record<string, unknown>
  // Internal field for audit (not exposed in public API schema)
  _addedBy?: string
}

export interface UpdateMemberRoleInput {
  userId: string
  contextType: ContextType
  contextId: string
  roleId: string | null
  // Note: updatedBy is automatically obtained from authenticated session
}

export const memberEndpoints = (config?: TenancyConfig) => ({
  addMember: createAuthEndpoint(
    '/member/add',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        roleId: z.string().optional(),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Add member',
          description: 'Add a member to a context (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      const session = await requireSession(ctx)
      const addedBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.add, ctx, session)

      const { userId, contextType, contextId, roleId, metadata } = ctx.body

      // Check limits
      if (config?.limits) {
        const model = contextType === 'organization' ? 'organizationMember' : contextType === 'team' ? 'teamMember' : 'subteamMember'
        const field = contextType === 'organization' ? 'organizationId' : contextType === 'team' ? 'teamId' : 'subteamId'
        const allMembers = await ctx.context.adapter.findMany({
          model,
          where: [{ field, value: contextId }],
        }) as Member[]
        const limit = config.limits.maxMembersPerOrganization
        if (limit && allMembers.length >= limit) {
          throw new APIError('BAD_REQUEST', { message: 'Member limit reached' })
        }
      }

      let member: Member

      switch (contextType) {
        case 'organization':
          member = await ctx.context.adapter.create({
            model: 'organizationMember',
            data: {
              organizationId: contextId,
              userId,
              roleId: roleId || null,
              metadata,
            },
          }) as OrganizationMember
          break
        case 'team':
          member = await ctx.context.adapter.create({
            model: 'teamMember',
            data: {
              teamId: contextId,
              userId,
              roleId: roleId || null,
              metadata,
            },
          }) as TeamMember
          break
        case 'subteam':
          member = await ctx.context.adapter.create({
            model: 'subteamMember',
            data: {
              subteamId: contextId,
              userId,
              roleId: roleId || null,
              metadata,
            },
          }) as SubteamMember
          break
      }

      if (config?.audit?.onMemberAdded) {
        await config.audit.onMemberAdded({
          userId,
          contextType,
          contextId,
          roleId,
          addedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(member, { status: 201 })
    }
  ),

  getMember: createAuthEndpoint(
    '/member/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get member',
          description: 'Get member by ID',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx)

      const { id } = ctx.params

      // Try each type until we find it
      const orgMember = await ctx.context.adapter.findOne({
        model: 'organizationMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as OrganizationMember | null
      if (orgMember) return ctx.json(orgMember)

      const teamMember = await ctx.context.adapter.findOne({
        model: 'teamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as TeamMember | null
      if (teamMember) return ctx.json(teamMember)

      const subteamMember = await ctx.context.adapter.findOne({
        model: 'subteamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as SubteamMember | null
      if (subteamMember) return ctx.json(subteamMember)

      throw new APIError('NOT_FOUND', { message: 'Member not found' })
    }
  ),

  updateMemberRole: createAuthEndpoint(
    '/member/:id/role',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
        roleId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Update member role',
          description: 'Update a member\'s role (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      const { id } = ctx.params
      const { roleId } = ctx.body

      // Find member and enrich context BEFORE calling hook
      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Member not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.member?.updateRole, {
        ...ctx,
        resource,
      })

      const existing = resource.data as Member
      const memberType = resource.contextType

      const oldRoleId = existing.roleId
      let updated: Member

      if (memberType === 'organization') {
        updated = await ctx.context.adapter.update({
          model: 'organizationMember',
          where: [{ field: 'id', value: id }],
          update: { roleId },
        }) as OrganizationMember
      } else if (memberType === 'team') {
        updated = await ctx.context.adapter.update({
          model: 'teamMember',
          where: [{ field: 'id', value: id }],
          update: { roleId },
        }) as TeamMember
      } else {
        updated = await ctx.context.adapter.update({
          model: 'subteamMember',
          where: [{ field: 'id', value: id }],
          update: { roleId },
        }) as SubteamMember
      }

      if (config?.audit?.onRoleChanged) {
        const contextId = 'organizationId' in existing ? existing.organizationId : 'teamId' in existing ? existing.teamId : (existing as SubteamMember).subteamId
        await config.audit.onRoleChanged({
          userId: existing.userId,
          contextType: memberType,
          contextId,
          oldRoleId: oldRoleId ?? null,
          newRoleId: roleId,
          changedBy: updatedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  updateMemberMetadata: createAuthEndpoint(
    '/member/:id/metadata',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
        metadata: z.record(z.unknown()),
      }),
      metadata: {
        openapi: {
          summary: 'Update member metadata',
          description: 'Update a member\'s metadata (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      await requireSession(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.updateRole, ctx)

      const { id } = ctx.params
      const { metadata } = ctx.body

      // Try to find and update the member
      const orgMember = await ctx.context.adapter.findOne({
        model: 'organizationMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as OrganizationMember | null
      if (orgMember) {
        const updated = await ctx.context.adapter.update({
          model: 'organizationMember',
          where: [{ field: 'id', value: id }],
          update: { metadata },
        }) as OrganizationMember
        return ctx.json(updated)
      }

      const teamMember = await ctx.context.adapter.findOne({
        model: 'teamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as TeamMember | null
      if (teamMember) {
        const updated = await ctx.context.adapter.update({
          model: 'teamMember',
          where: [{ field: 'id', value: id }],
          update: { metadata },
        }) as TeamMember
        return ctx.json(updated)
      }

      const subteamMember = await ctx.context.adapter.findOne({
        model: 'subteamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as SubteamMember | null
      if (subteamMember) {
        const updated = await ctx.context.adapter.update({
          model: 'subteamMember',
          where: [{ field: 'id', value: id }],
          update: { metadata },
        }) as SubteamMember
        return ctx.json(updated)
      }

      throw new APIError('NOT_FOUND', { message: 'Member not found' })
    }
  ),

  removeMember: createAuthEndpoint(
    '/member/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Remove member',
          description: 'Remove a member from a context (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      const session = await requireSession(ctx)
      const removedBy = session.user.id

      const { id } = ctx.params

      // Find member and enrich context BEFORE calling hook
      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Member not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.member?.remove, {
        ...ctx,
        resource,
      })

      const existing = resource.data as Member
      const memberType = resource.contextType

      // Delete member based on context type
      const modelName =
        memberType === 'organization'
          ? 'organizationMember'
          : memberType === 'team'
            ? 'teamMember'
            : 'subteamMember'

      await ctx.context.adapter.delete({
        model: modelName,
        where: [{ field: 'id', value: id }],
      })

      // Trigger audit hook if configured
      if (config?.audit?.onMemberRemoved) {
        await config.audit.onMemberRemoved({
          userId: existing.userId,
          contextType: memberType,
          contextId: resource.contextId,
          removedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  listMembers: createAuthEndpoint(
    '/member/list/:contextType/:contextId',
    {
      method: 'GET',
      params: z.object({
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
      }),
      query: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List members',
          description: 'List all members in a context',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx)

      const { contextType, contextId } = ctx.params
      const { limit, offset } = ctx.query

      let items: Member[] = []
      switch (contextType) {
        case 'organization':
          items = await ctx.context.adapter.findMany({
            model: 'organizationMember',
            where: [{ field: 'organizationId', value: contextId }],
          }) as OrganizationMember[]
          break
        case 'team':
          items = await ctx.context.adapter.findMany({
            model: 'teamMember',
            where: [{ field: 'teamId', value: contextId }],
          }) as TeamMember[]
          break
        case 'subteam':
          items = await ctx.context.adapter.findMany({
            model: 'subteamMember',
            where: [{ field: 'subteamId', value: contextId }],
          }) as SubteamMember[]
          break
      }

      const total = items.length
      if (offset) items = items.slice(offset)
      if (limit) items = items.slice(0, limit)

      return ctx.json({ items, total })
    }
  ),

  getUserMemberships: createAuthEndpoint(
    '/member/user/:userId',
    {
      method: 'GET',
      params: z.object({ userId: z.string() }),
      query: z.object({
        contextType: z.enum(['organization', 'team', 'subteam']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Get user memberships',
          description: 'Get all memberships for a user',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx)

      const { userId } = ctx.params
      const { contextType } = ctx.query

      if (contextType) {
        switch (contextType) {
          case 'organization':
            const orgs = await ctx.context.adapter.findMany({
              model: 'organizationMember',
              where: [{ field: 'userId', value: userId }],
            }) as OrganizationMember[]
            return ctx.json(orgs)
          case 'team':
            const teams = await ctx.context.adapter.findMany({
              model: 'teamMember',
              where: [{ field: 'userId', value: userId }],
            }) as TeamMember[]
            return ctx.json(teams)
          case 'subteam':
            const subteams = await ctx.context.adapter.findMany({
              model: 'subteamMember',
              where: [{ field: 'userId', value: userId }],
            }) as SubteamMember[]
            return ctx.json(subteams)
        }
      }

      const orgs = await ctx.context.adapter.findMany({
        model: 'organizationMember',
        where: [{ field: 'userId', value: userId }],
      }) as OrganizationMember[]
      const teams = await ctx.context.adapter.findMany({
        model: 'teamMember',
        where: [{ field: 'userId', value: userId }],
      }) as TeamMember[]
      const subteams = await ctx.context.adapter.findMany({
        model: 'subteamMember',
        where: [{ field: 'userId', value: userId }],
      }) as SubteamMember[]

      return ctx.json([...orgs, ...teams, ...subteams])
    }
  ),

  checkMembership: createAuthEndpoint(
    '/member/check',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Check membership',
          description: 'Check if user is a member of a context',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx)

      const { userId, contextType, contextId } = ctx.body

      let member: Member | null = null
      switch (contextType) {
        case 'organization': {
          const members = await ctx.context.adapter.findMany({
            model: 'organizationMember',
            where: [
              { field: 'userId', value: userId },
              { field: 'organizationId', value: contextId },
            ],
          }) as OrganizationMember[]
          member = members[0] || null
          break
        }
        case 'team': {
          const members = await ctx.context.adapter.findMany({
            model: 'teamMember',
            where: [
              { field: 'userId', value: userId },
              { field: 'teamId', value: contextId },
            ],
          }) as TeamMember[]
          member = members[0] || null
          break
        }
        case 'subteam': {
          const members = await ctx.context.adapter.findMany({
            model: 'subteamMember',
            where: [
              { field: 'userId', value: userId },
              { field: 'subteamId', value: contextId },
            ],
          }) as SubteamMember[]
          member = members[0] || null
          break
        }
      }

      return ctx.json({ isMember: member !== null })
    }
  ),
})

// Helper function for other modules
export async function _addMember(
  adapter: Adapter,
  input: AddMemberInput,
  config?: TenancyConfig
): Promise<Member> {
  if (config?.limits) {
    const model = input.contextType === 'organization' ? 'organizationMember' : input.contextType === 'team' ? 'teamMember' : 'subteamMember'
    const field = input.contextType === 'organization' ? 'organizationId' : input.contextType === 'team' ? 'teamId' : 'subteamId'
    const allMembers = await adapter.findMany({
      model,
      where: [{ field, value: input.contextId }],
    }) as Member[]
    const limit = config.limits.maxMembersPerOrganization
    if (limit && allMembers.length >= limit) {
      throw new Error('Member limit reached')
    }
  }

  let member: Member

  switch (input.contextType) {
    case 'organization':
      member = await adapter.create({
        model: 'organizationMember',
        data: {
          organizationId: input.contextId,
          userId: input.userId,
          roleId: input.roleId || null,
          metadata: input.metadata,
        },
      }) as OrganizationMember
      break
    case 'team':
      member = await adapter.create({
        model: 'teamMember',
        data: {
          teamId: input.contextId,
          userId: input.userId,
          roleId: input.roleId || null,
          metadata: input.metadata,
        },
      }) as TeamMember
      break
    case 'subteam':
      member = await adapter.create({
        model: 'subteamMember',
        data: {
          subteamId: input.contextId,
          userId: input.userId,
          roleId: input.roleId || null,
          metadata: input.metadata,
        },
      }) as SubteamMember
      break
  }

  if (config?.audit?.onMemberAdded && input._addedBy) {
    await config.audit.onMemberAdded({
      userId: input.userId,
      contextType: input.contextType,
      contextId: input.contextId,
      roleId: input.roleId,
      addedBy: input._addedBy,
      timestamp: new Date(),
    })
  }

  return member
}
