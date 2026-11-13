import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { DBAdapter } from 'better-auth'
import type { Member } from '../schema/index.js'
import type { ContextType } from '../types/context.js'
import type { TenancyConfig, ResourceContext } from '../types/config.js'
import { applyEndpointAuth, requireEndpointAuth, requireSession, requireSelfOr } from './middleware.js'
import { getErrorMessage } from '../utils/error-messages.js'
import { getLocaleFromHeaders, resolveRoleTranslation } from '../utils/locale-helper.js'
import { ok, created, noContent, okList, okArray, memberSchema, memberEnrichedSchema } from './openapi.js'

export type { Member } from '../schema/index.js'


/**
 * Find member and determine its context (organization or team)
 * Single query to the unified member model
 */
export async function findMemberContext(
  adapter: DBAdapter,
  memberId: string
): Promise<ResourceContext | null> {
  const member = await adapter.findOne({
    model: 'member',
    where: [{ field: 'id', value: memberId }],
  }).catch(() => null) as Member | null

  if (member) {
    return {
      contextType: member.contextType as 'organization' | 'team',
      contextId: member.contextId,
      data: member,
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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        roleId: z.string().optional(),
        metadata: config?.schemas?.member?.metadata ?? z.record(z.string(), z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Add member',
          description: 'Add a member to a context (requires authentication)',
          responses: created(memberEnrichedSchema, 'Member added'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const addedBy = session.user.id

      await requireEndpointAuth(config?.endpoints?.member?.add, ctx, session)

      const { userId, contextType, contextId, roleId, metadata } = ctx.body

      // Check limits
      if (config?.limits) {
        const allMembers = await ctx.context.adapter.findMany({
          model: 'member',
          where: [{ field: 'contextType', value: contextType }, { field: 'contextId', value: contextId }],
        }) as Member[]
        const limit = config.limits.maxMembersPerOrganization
        if (limit && allMembers.length >= limit) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('member.limit_reached', locale, undefined, config?.i18n?.errorMessages)
          })
        }
      }

      const member = await ctx.context.adapter.create({
        model: 'member',
        data: {
          contextType,
          contextId,
          userId,
          roleId: roleId || null,
          metadata,
        },
      }) as Member

      const memberEventData = {
        userId,
        contextType,
        contextId,
        roleId,
        addedBy,
        timestamp: new Date(),
      }

      if (config?.actions?.onMemberAdded) {
        try {
          await config.actions.onMemberAdded(memberEventData, ctx)
        } catch (error) {
          await ctx.context.adapter.delete({
            model: 'member',
            where: [{ field: 'id', value: member.id }],
          })
          throw error
        }
      }

      if (config?.audit?.onMemberAdded) {
        await config.audit.onMemberAdded(memberEventData)
      }

      // Enrich with user and role data in parallel for consistent response
      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: userId }],
        }).catch(() => null),
        roleId ? ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: roleId }],
        }).catch(() => null) : Promise.resolve(null)
      ]) as [any, any]

      const roleTranslation = role ? await resolveRoleTranslation(ctx.context.adapter, role.id, locale) : null

      // Remove duplicate fields (userId, roleId) - keep only enriched objects
      const { userId: _, roleId: __, ...memberWithoutDuplicates } = member

      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: roleTranslation?.name ?? role.name, description: roleTranslation?.description ?? role.description } : null,
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
          responses: ok(memberEnrichedSchema, 'The member with enriched user and role'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.member?.list, ctx, session)

      const { id } = ctx.params

      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      const memberData = resource.data as Member

      // Enrich with user and role data in parallel
      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: memberData.userId }],
        }).catch(() => null),
        memberData.roleId ? ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: memberData.roleId }],
        }).catch(() => null) : Promise.resolve(null)
      ]) as [any, any]

      const roleTranslation = role ? await resolveRoleTranslation(ctx.context.adapter, role.id, locale) : null

      // Remove duplicate fields (userId, roleId) - keep only enriched objects
      const { userId, roleId, ...memberWithoutDuplicates } = memberData

      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: roleTranslation?.name ?? role.name, description: roleTranslation?.description ?? role.description } : null,
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
          responses: ok(memberEnrichedSchema, 'Updated member'),
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

      await requireEndpointAuth(config?.endpoints?.member?.updateRole, {
        ...ctx,
        resource,
      }, session)

      const existing = resource.data as Member
      const oldRoleId = existing.roleId

      const updated = await ctx.context.adapter.update({
        model: 'member',
        where: [{ field: 'id', value: id }],
        update: { roleId },
      }) as Member

      if (config?.audit?.onRoleChanged) {
        await config.audit.onRoleChanged({
          userId: existing.userId,
          contextType: resource.contextType,
          contextId: resource.contextId,
          oldRoleId: oldRoleId ?? null,
          newRoleId: roleId,
          changedBy: updatedBy,
          timestamp: new Date(),
        })
      }

      // Enrich with user and role data in parallel for consistent response
      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: updated.userId }],
        }).catch(() => null),
        ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: roleId }],
        }).catch(() => null)
      ]) as [any, any]

      const roleTranslation = role ? await resolveRoleTranslation(ctx.context.adapter, role.id, locale) : null

      // Remove duplicate fields (userId, roleId) - keep only enriched objects
      const { userId, roleId: _, ...memberWithoutDuplicates } = updated

      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: roleTranslation?.name ?? role.name, description: roleTranslation?.description ?? role.description } : null,
      })
    }
  ),

  updateMemberMetadata: createAuthEndpoint(
    '/tenancy/member/metadata/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        metadata: config?.schemas?.member?.metadata ?? z.record(z.string(), z.unknown()),
      }),
      metadata: {
        openapi: {
          summary: 'Update member metadata',
          description: 'Update a member\'s metadata (requires authentication)',
          responses: ok(memberEnrichedSchema, 'Updated member'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)

      const { id, metadata } = ctx.body

      // Try to find the member
      const resource = await findMemberContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('member.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      // Match updateMemberRole's shape: the hook expects ctx.resource + session
      await requireEndpointAuth(config?.endpoints?.member?.updateRole, { ...ctx, resource }, session)

      const updated = await ctx.context.adapter.update({
        model: 'member',
        where: [{ field: 'id', value: id }],
        update: { metadata },
      }) as Member

      // Enrich with user and role data in parallel for consistent response
      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
      const [user, role] = await Promise.all([
        ctx.context.adapter.findOne({
          model: 'user',
          where: [{ field: 'id', value: updated.userId }],
        }).catch(() => null),
        updated.roleId ? ctx.context.adapter.findOne({
          model: 'role',
          where: [{ field: 'id', value: updated.roleId }],
        }).catch(() => null) : Promise.resolve(null)
      ]) as [any, any]

      const roleTranslation = role ? await resolveRoleTranslation(ctx.context.adapter, role.id, locale) : null

      const { userId, roleId, ...memberWithoutDuplicates } = updated
      return ctx.json({
        ...memberWithoutDuplicates,
        user: user ? { id: user.id, name: user.name, image: user.image } : null,
        role: role ? { id: role.id, name: roleTranslation?.name ?? role.name, description: roleTranslation?.description ?? role.description } : null,
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
          responses: noContent('Member removed'),
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

      await requireEndpointAuth(config?.endpoints?.member?.remove, {
        ...ctx,
        resource,
      }, session)

      const existing = resource.data as Member

      // Delete member's permission grants and denies
      const [grants, denies] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'permissionGrant',
          where: [
            { field: 'userId', value: existing.userId },
            { field: 'contextType', value: resource.contextType },
            { field: 'contextId', value: resource.contextId },
          ],
        }) as Promise<any[]>,
        ctx.context.adapter.findMany({
          model: 'permissionDeny',
          where: [
            { field: 'userId', value: existing.userId },
            { field: 'contextType', value: resource.contextType },
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
        model: 'member',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onMemberRemoved) {
        await config.audit.onMemberRemoved({
          userId: existing.userId,
          contextType: resource.contextType,
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
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List members',
          description: 'List all members in a context. When permission filtering is configured, returns all filtered items without pagination (limit/offset params are ignored).',
          responses: okList(memberEnrichedSchema, 'List of enriched members'),
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
        (contextType === 'team' && config?.permissionFiltering?.filterTeamMembers)

      let items: Member[]
      let total: number

      const where = [{ field: 'contextType', value: contextType }, { field: 'contextId', value: contextId }]

      // With permission filtering: fetch ALL, filter, return all filtered (no pagination)
      if (hasPermissionFiltering) {
        items = await ctx.context.adapter.findMany({
          model: 'member',
          where,
        }) as Member[]

        if (contextType === 'organization' && config?.permissionFiltering?.filterOrganizationMembers) {
          items = await config.permissionFiltering.filterOrganizationMembers(
            ctx,
            items,
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
              items,
              { teamId: contextId, parentType: team.parentType, parentId: team.parentId }
            )
          }
        }

        total = items.length
      } else {
        // Without permission filtering: use efficient DB pagination
        const [fetchedItems, fetchedTotal] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'member',
            where,
            limit,
            offset,
          }) as Promise<Member[]>,
          ctx.context.adapter.count({
            model: 'member',
            where,
          })
        ])

        items = fetchedItems
        total = fetchedTotal
      }

      // Batch fetch users and roles in parallel for better performance (avoid N+1 queries)
      const userIds = [...new Set(items.map(m => m.userId))]
      const roleIds = [...new Set(items.map(m => m.roleId).filter(Boolean))] as string[]
      const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)

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
            model: 'role',
            where: [{ field: 'id', value: roleId }],
          }).catch(() => null)
        ))
      ]) as [any[], any[]]

      // Fetch translations for the relevant roleIds only (+ 'en' fallback) in 1–2 queries
      const [localeTs = [], enTs = []] = roleIds.length > 0 ? await Promise.all([
        ctx.context.adapter.findMany({
          model: 'roleTranslation',
          where: [{ field: 'roleId', operator: 'in', value: roleIds }, { field: 'locale', value: locale }],
        }).catch(() => []),
        locale !== 'en'
          ? ctx.context.adapter.findMany({
              model: 'roleTranslation',
              where: [{ field: 'roleId', operator: 'in', value: roleIds }, { field: 'locale', value: 'en' }],
            }).catch(() => [])
          : Promise.resolve([]),
      ]) as any[][] : [[], []]
      const localeMap = new Map<string, any>(localeTs.map((t: any) => [t.roleId, t]))
      const enMap = new Map<string, any>(enTs.map((t: any) => [t.roleId, t]))
      const translationMap = new Map<string, any>(
        roleIds.map(id => [id, localeMap.get(id) ?? enMap.get(id) ?? null])
      )

      const userMap = new Map(users.filter(Boolean).map(u => [u.id, u]))
      const roleMap = new Map(roles.filter(Boolean).map(r => [r.id, r]))

      // Enrich members with cached user and role data
      const enrichedItems = items.map((member) => {
        const user = userMap.get(member.userId)
        const role = member.roleId ? roleMap.get(member.roleId) : null
        const t = member.roleId ? translationMap.get(member.roleId) : null

        // Remove duplicate fields (userId, roleId) - keep only enriched objects
        const { userId, roleId, ...memberWithoutDuplicates } = member

        return {
          ...memberWithoutDuplicates,
          user: user ? { id: user.id, name: user.name, image: user.image } : null,
          role: role ? { id: role.id, name: t?.name ?? role.name, description: t?.description ?? role.description } : null,
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
        contextType: z.enum(['organization', 'team']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Get user memberships',
          description: 'Get all memberships for a user',
          responses: okArray(memberSchema, 'The user\'s raw membership rows'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const { userId, contextType } = ctx.query

      // Subject lookup: self by default, dedicated hook is the admin override
      await requireSelfOr(userId === session.user.id, config?.endpoints?.member?.getMemberships, ctx, session)

      const where: Array<{ field: string; value: string }> = [{ field: 'userId', value: userId }]
      if (contextType) {
        where.push({ field: 'contextType', value: contextType })
      }

      const memberships = await ctx.context.adapter.findMany({
        model: 'member',
        where,
      }) as Member[]

      return ctx.json(memberships)
    }
  ),

  checkMembership: createAuthEndpoint(
    '/tenancy/member/check',
    {
      method: 'POST',
      body: z.object({
        userId: z.string(),
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Check membership',
          description: 'Check if user is a member of a context',
          responses: ok(
            { type: 'object', properties: { isMember: { type: 'boolean' } }, required: ['isMember'] },
            'Whether the user is a member',
          ),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const { userId, contextType, contextId } = ctx.body

      // Subject lookup: self by default, dedicated hook is the admin override
      await requireSelfOr(userId === session.user.id, config?.endpoints?.member?.getMemberships, ctx, session)

      // ponytail: wrap adapter here specifically — service keys call this endpoint
      // for cross-user checks; a transient DB error should be 503 (retryable),
      // not 500 (fatal), so the Go SDK can distinguish and retry.
      let members: Member[]
      try {
        members = await ctx.context.adapter.findMany({
          model: 'member',
          where: [
            { field: 'userId', value: userId },
            { field: 'contextType', value: contextType },
            { field: 'contextId', value: contextId },
          ],
        }) as Member[]
      } catch {
        throw new APIError('SERVICE_UNAVAILABLE', {
          message: 'Membership check temporarily unavailable. Please retry.',
        })
      }

      return ctx.json({ isMember: members.length > 0 })
    }
  ),
})

// Helper function for other modules
export async function _addMember(
  adapter: DBAdapter,
  input: AddMemberInput,
  config?: TenancyConfig,
  ctx?: any
): Promise<Member> {
  if (config?.limits) {
    const allMembers = await adapter.findMany({
      model: 'member',
      where: [{ field: 'contextType', value: input.contextType }, { field: 'contextId', value: input.contextId }],
    }) as Member[]
    const limit = config.limits.maxMembersPerOrganization
    if (limit && allMembers.length >= limit) {
      throw new Error('Member limit reached')
    }
  }

  const member = await adapter.create({
    model: 'member',
    data: {
      contextType: input.contextType,
      contextId: input.contextId,
      userId: input.userId,
      roleId: input.roleId || null,
      metadata: input.metadata,
    },
  }) as Member

  if (input._addedBy) {
    const memberEventData = {
      userId: input.userId,
      contextType: input.contextType,
      contextId: input.contextId,
      roleId: input.roleId,
      addedBy: input._addedBy,
      timestamp: new Date(),
    }

    if (config?.actions?.onMemberAdded && ctx) {
      try {
        await config.actions.onMemberAdded(memberEventData, ctx)
      } catch (error) {
        await adapter.delete({
          model: 'member',
          where: [{ field: 'id', value: member.id }],
        })
        throw error
      }
    }

    if (config?.audit?.onMemberAdded) {
      await config.audit.onMemberAdded(memberEventData)
    }
  }

  return member
}
