import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { OrganizationMember, TeamMember, SubteamMember } from '../schema'
import type { ContextType } from '../types/context'
import type { TenancyConfig, ResourceContext } from '../types/config'
import { applyEndpointAuth, requireSession } from './middleware'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'

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
}

export const memberEndpoints = (config?: TenancyConfig) => ({
  addMember: createAuthEndpoint(
    '/tenancy/member/add',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        roleId: z.string().optional(),
        metadata: config?.schemas?.member?.metadata ?? z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Add member',
          description: 'Add a member to a context (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const addedBy = session.user.id

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
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('member.limit_reached', locale, undefined, config?.i18n?.errorMessages)
          })
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

      // Enrich with user and role data in parallel for consistent response
      const roleModel = contextType === 'organization' ? 'organizationRole' : 'teamRole'

      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        }).catch(() => null),
        roleId ? ctx.context.adapter.findOne({
          model: roleModel,
          where: [{ field: 'id', value: roleId }],
        }).catch(() => null) : Promise.resolve(null)
      ]) as [any, any]

      // Remove duplicate fields (userId, roleId) - keep only enriched objects
      const { userId: _, roleId: __, ...memberWithoutDuplicates } = member

      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: role.name, description: role.description } : null,
      }, { status: 201 })
    }
  ),

  getMember: createAuthEndpoint(
    '/tenancy/member/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get member',
          description: 'Get member by ID with enriched user and role data',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx, session)

      const { id } = ctx.params

      const orgMember = await ctx.context.adapter.findOne({
        model: 'organizationMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as OrganizationMember | null
      if (orgMember) {
        // Enrich with user and role data in parallel
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: orgMember.userId }],
          }).catch(() => null),
          orgMember.roleId ? ctx.context.adapter.findOne({
            model: 'organizationRole',
            where: [{ field: 'id', value: orgMember.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        // Remove duplicate fields (userId, roleId) - keep only enriched objects
        const { userId, roleId, ...memberWithoutDuplicates } = orgMember

        return ctx.json({
          ...memberWithoutDuplicates,
          user: user || null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
      }

      const teamMember = await ctx.context.adapter.findOne({
        model: 'teamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as TeamMember | null
      if (teamMember) {
        // Enrich with user and role data in parallel
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: teamMember.userId }],
          }).catch(() => null),
          teamMember.roleId ? ctx.context.adapter.findOne({
            model: 'teamRole',
            where: [{ field: 'id', value: teamMember.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        // Remove duplicate fields (userId, roleId) - keep only enriched objects
        const { userId, roleId, ...memberWithoutDuplicates } = teamMember

        return ctx.json({
          ...memberWithoutDuplicates,
          user: user || null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
      }

      const subteamMember = await ctx.context.adapter.findOne({
        model: 'subteamMember',
        where: [{ field: 'id', value: id }],
      }).catch(() => null) as SubteamMember | null
      if (subteamMember) {
        // Enrich with user and role data in parallel
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: subteamMember.userId }],
          }).catch(() => null),
          subteamMember.roleId ? ctx.context.adapter.findOne({
            model: 'teamRole',
            where: [{ field: 'id', value: subteamMember.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        // Remove duplicate fields (userId, roleId) - keep only enriched objects
        const { userId, roleId, ...memberWithoutDuplicates } = subteamMember

        return ctx.json({
          ...memberWithoutDuplicates,
          user: user || null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
      }

      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      throw new APIError('NOT_FOUND', {
        message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
      })
    }
  ),

  updateMemberRole: createAuthEndpoint(
    '/tenancy/member/role/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
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
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      const { id, roleId } = ctx.body

      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.member?.updateRole, {
        ...ctx,
        resource,
      }, session)

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

      // Enrich with user and role data in parallel for consistent response
      const roleModel = memberType === 'organization' ? 'organizationRole' : 'teamRole'

      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: updated.userId }],
        }).catch(() => null),
        ctx.context.adapter.findOne({
          model: roleModel,
          where: [{ field: 'id', value: roleId }],
        }).catch(() => null)
      ]) as [any, any]

      // Remove duplicate fields (userId, roleId) - keep only enriched objects
      const { userId, roleId: _, ...memberWithoutDuplicates } = updated

      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: role.name, description: role.description } : null,
      })
    }
  ),

  updateMemberMetadata: createAuthEndpoint(
    '/tenancy/member/metadata/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        metadata: config?.schemas?.member?.metadata ?? z.record(z.unknown()),
      }),
      metadata: {
        openapi: {
          summary: 'Update member metadata',
          description: 'Update a member\'s metadata (requires authentication)',
        },
      },
    },
    async (ctx) => {
      await requireSession(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.updateRole, ctx)

      const { id, metadata } = ctx.body

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

        // Enrich with user and role data in parallel for consistent response
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: updated.userId }],
          }).catch(() => null),
          updated.roleId ? ctx.context.adapter.findOne({
            model: 'organizationRole',
            where: [{ field: 'id', value: updated.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        const { userId, roleId, ...memberWithoutDuplicates } = updated
        return ctx.json({
          ...memberWithoutDuplicates,
          user: user ? { id: user.id, name: user.name, image: user.image } : null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
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

        // Enrich with user and role data in parallel for consistent response
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: updated.userId }],
          }).catch(() => null),
          updated.roleId ? ctx.context.adapter.findOne({
            model: 'teamRole',
            where: [{ field: 'id', value: updated.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        const { userId, roleId, ...memberWithoutDuplicates } = updated
        return ctx.json({
          ...memberWithoutDuplicates,
          user: user ? { id: user.id, name: user.name, image: user.image } : null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
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

        // Enrich with user and role data in parallel for consistent response
        const [user, role] = await Promise.all([
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: updated.userId }],
          }).catch(() => null),
          updated.roleId ? ctx.context.adapter.findOne({
            model: 'teamRole',
            where: [{ field: 'id', value: updated.roleId }],
          }).catch(() => null) : Promise.resolve(null)
        ]) as [any, any]

        const { userId, roleId, ...memberWithoutDuplicates } = updated
        return ctx.json({
          ...memberWithoutDuplicates,
          user: user ? { id: user.id, name: user.name, image: user.image } : null,
          role: role ? { id: role.id, name: role.name, description: role.description } : null,
        })
      }

      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      throw new APIError('NOT_FOUND', {
        message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
      })
    }
  ),

  removeMember: createAuthEndpoint(
    '/tenancy/member/remove',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Remove member',
          description: 'Remove a member from a context (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const removedBy = session.user.id

      const { id } = ctx.body

      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.member?.remove, {
        ...ctx,
        resource,
      }, session)

      const existing = resource.data as Member
      const memberType = resource.contextType

      const modelName =
        memberType === 'organization'
          ? 'organizationMember'
          : memberType === 'team'
            ? 'teamMember'
            : 'subteamMember'

      // Delete member's permission grants and denies
      const [grants, denies] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'permissionGrant',
          where: [
            { field: 'userId', value: existing.userId },
            { field: 'contextType', value: memberType },
            { field: 'contextId', value: resource.contextId },
          ],
        }) as Promise<any[]>,
        ctx.context.adapter.findMany({
          model: 'permissionDeny',
          where: [
            { field: 'userId', value: existing.userId },
            { field: 'contextType', value: memberType },
            { field: 'contextId', value: resource.contextId },
          ],
        }) as Promise<any[]>
      ])

      for (const grant of grants) {
        await ctx.context.adapter.delete({
          model: 'permissionGrant',
          where: [{ field: 'id', value: grant.id }],
        })
      }

      for (const deny of denies) {
        await ctx.context.adapter.delete({
          model: 'permissionDeny',
          where: [{ field: 'id', value: deny.id }],
        })
      }

      // Delete the member
      await ctx.context.adapter.delete({
        model: modelName,
        where: [{ field: 'id', value: id }],
      })

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
    '/tenancy/member/list',
    {
      method: 'GET',
      query: z.object({
        contextType: z.enum(['organization', 'team', 'subteam']),
        contextId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List members',
          description: 'List all members in a context. When permission filtering is configured, returns all filtered items without pagination (limit/offset params are ignored).',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx, session)

      const { contextType, contextId, limit = 50, offset = 0 } = ctx.query

      // Check if we need permission filtering
      const hasPermissionFiltering =
        (contextType === 'organization' && config?.permissionFiltering?.filterOrganizationMembers) ||
        (contextType === 'team' && config?.permissionFiltering?.filterTeamMembers) ||
        (contextType === 'subteam' && config?.permissionFiltering?.filterSubteamMembers)

      let items: Member[]
      let total: number

      const model = contextType === 'organization' ? 'organizationMember' :
                   contextType === 'team' ? 'teamMember' : 'subteamMember'
      const field = contextType === 'organization' ? 'organizationId' :
                   contextType === 'team' ? 'teamId' : 'subteamId'
      const where = [{ field, value: contextId }]

      // With permission filtering: fetch ALL, filter, return all filtered (no pagination)
      if (hasPermissionFiltering) {
        items = await ctx.context.adapter.findMany({
          model,
          where,
        }) as Member[]

        if (contextType === 'organization' && config?.permissionFiltering?.filterOrganizationMembers) {
          items = await config.permissionFiltering.filterOrganizationMembers(
            ctx,
            items as OrganizationMember[],
            { organizationId: contextId }
          )
        } else if (contextType === 'team' && config?.permissionFiltering?.filterTeamMembers) {
          const team = await ctx.context.adapter.findOne({
            model: 'team',
            where: [{ field: 'id', value: contextId }],
          }) as any
          if (team) {
            items = await config.permissionFiltering.filterTeamMembers(
              ctx,
              items as TeamMember[],
              { teamId: contextId, organizationId: team.organizationId }
            )
          }
        } else if (contextType === 'subteam' && config?.permissionFiltering?.filterSubteamMembers) {
          const subteam = await ctx.context.adapter.findOne({
            model: 'subteam',
            where: [{ field: 'id', value: contextId }],
          }) as any
          if (subteam) {
            const team = await ctx.context.adapter.findOne({
              model: 'team',
              where: [{ field: 'id', value: subteam.teamId }],
            }) as any
            if (team) {
              items = await config.permissionFiltering.filterSubteamMembers(
                ctx,
                items as SubteamMember[],
                { subteamId: contextId, teamId: subteam.teamId, organizationId: team.organizationId }
              )
            }
          }
        }

        total = items.length
      } else {
        // Without permission filtering: use efficient DB pagination
        const [fetchedItems, fetchedTotal] = await Promise.all([
          ctx.context.adapter.findMany({
            model,
            where,
            limit,
            offset,
          }) as Promise<Member[]>,
          ctx.context.adapter.count({
            model,
            where,
          })
        ])

        items = fetchedItems
        total = fetchedTotal
      }

      // Batch fetch users and roles in parallel for better performance (avoid N+1 queries)
      const userIds = [...new Set(items.map(m => m.userId))]
      const roleIds = [...new Set(items.map(m => m.roleId).filter(Boolean))] as string[]

      const roleModel = contextType === 'organization' ? 'organizationRole' :
                       contextType === 'team' ? 'teamRole' : 'teamRole'

      // Execute user and role queries in parallel
      const [users, roles] = await Promise.all([
        Promise.all(userIds.map(userId =>
          ctx.context.adapter.findOne({
            model: 'user',
            where: [{ field: 'id', value: userId }],
          }).catch(() => null)
        )),
        Promise.all(roleIds.map(roleId =>
          ctx.context.adapter.findOne({
            model: roleModel,
            where: [{ field: 'id', value: roleId }],
          }).catch(() => null)
        ))
      ]) as [any[], any[]]

      const userMap = new Map(users.filter(Boolean).map(u => [u.id, u]))
      const roleMap = new Map(roles.filter(Boolean).map(r => [r.id, r]))

      // Enrich members with cached user and role data
      const enrichedItems = items.map((member) => {
        const user = userMap.get(member.userId)
        const role = member.roleId ? roleMap.get(member.roleId) : null

        // Remove duplicate fields (userId, roleId) - keep only enriched objects
        const { userId, roleId, ...memberWithoutDuplicates } = member

        return {
          ...memberWithoutDuplicates,
          user: user ? {
            id: user.id,
            name: user.name,
            image: user.image,
          } : null,
          role: role ? {
            id: role.id,
            name: role.name,
            description: role.description,
          } : null,
        }
      })

      // Return with or without pagination params based on whether permission filtering is active
      if (hasPermissionFiltering) {
        return ctx.json({ items: enrichedItems, total })
      }
      return ctx.json({ items: enrichedItems, total, limit, offset })
    }
  ),

  getUserMemberships: createAuthEndpoint(
    '/tenancy/member/user/memberships',
    {
      method: 'GET',
      query: z.object({
        userId: z.string(),
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
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx, session)

      const { userId, contextType } = ctx.query

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

      // Fetch all memberships in parallel
      const [orgs, teams, subteams] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'organizationMember',
          where: [{ field: 'userId', value: userId }],
        }) as Promise<OrganizationMember[]>,
        ctx.context.adapter.findMany({
          model: 'teamMember',
          where: [{ field: 'userId', value: userId }],
        }) as Promise<TeamMember[]>,
        ctx.context.adapter.findMany({
          model: 'subteamMember',
          where: [{ field: 'userId', value: userId }],
        }) as Promise<SubteamMember[]>
      ])

      return ctx.json([...orgs, ...teams, ...subteams])
    }
  ),

  checkMembership: createAuthEndpoint(
    '/tenancy/member/check',
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
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx, session)

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
