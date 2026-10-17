import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { Team } from '../schema/index.js'
import type { TenancyConfig } from '../types/index.js'
import { cleanupContextPermissions } from './permissions.js'
import { applyEndpointAuth, requireSession } from './middleware.js'
import { getErrorMessage } from '../utils/error-messages.js'
import { getLocaleFromHeaders } from '../utils/locale-helper.js'
import { ok, created, noContent, okList, teamSchema } from './openapi.js'

export interface CreateTeamInput {
  parentType: 'organization' | 'team'
  parentId: string
  name: string
  slug: string
  metadata?: Record<string, unknown>
}

export interface UpdateTeamInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
}

/**
 * Compute the nesting depth of a team by walking up the parent chain.
 * Returns 1 for a team directly under an organization, 2 for a team under a team, etc.
 * Safety: max 100 iterations to avoid infinite loops from circular references.
 */
async function computeNestingDepth(
  adapter: Adapter,
  parentType: string,
  parentId: string
): Promise<number> {
  let depth = 0
  let currentType = parentType
  let currentId = parentId

  for (let i = 0; i < 100; i++) {
    if (currentType === 'organization') {
      depth++
      break
    }
    // currentType === 'team', look up the parent team
    const parentTeam = await adapter.findOne({
      model: 'team',
      where: [{ field: 'id', value: currentId }],
    }) as Team | null
    if (!parentTeam) break
    depth++
    currentType = parentTeam.parentType
    currentId = parentTeam.parentId
  }

  return depth
}

/**
 * Recursively delete a team and all its descendants.
 * Depth-first: deletes child teams first, then the team itself.
 */
export async function deleteTeamRecursive(
  adapter: Adapter,
  teamId: string,
  config?: TenancyConfig
): Promise<{ teamsDeleted: number; grantsDeleted: number; deniesDeleted: number }> {
  let teamsDeleted = 0
  let grantsDeleted = 0
  let deniesDeleted = 0

  // 1. Find child teams
  const childTeams = await adapter.findMany({
    model: 'team',
    where: [{ field: 'parentType', value: 'team' }, { field: 'parentId', value: teamId }],
  }) as Team[]

  // 2. Recurse into each child (depth-first)
  for (const child of childTeams) {
    const result = await deleteTeamRecursive(adapter, child.id, config)
    teamsDeleted += result.teamsDeleted
    grantsDeleted += result.grantsDeleted
    deniesDeleted += result.deniesDeleted
  }

  // 3. Delete members for this team
  await adapter.delete({
    model: 'member',
    where: [{ field: 'contextType', value: 'team' }, { field: 'contextId', value: teamId }],
  })

  // 4. Delete roles and their statements
  const teamRoles = await adapter.findMany({
    model: 'role',
    where: [{ field: 'contextType', value: 'team' }, { field: 'contextId', value: teamId }],
  }) as any[]

  for (const role of teamRoles) {
    await adapter.delete({
      model: 'roleStatement',
      where: [{ field: 'roleId', value: role.id }],
    })
    await adapter.delete({
      model: 'role',
      where: [{ field: 'id', value: role.id }],
    })
  }

  // 5. Delete invitations
  await adapter.delete({
    model: 'invitation',
    where: [
      { field: 'contextType', value: 'team' },
      { field: 'contextId', value: teamId },
    ],
  })

  // 6. Delete permissions
  const cleanup = await cleanupContextPermissions(adapter, 'team', teamId)
  grantsDeleted += cleanup.grantsDeleted
  deniesDeleted += cleanup.deniesDeleted

  // 7. Delete the team itself
  await adapter.delete({
    model: 'team',
    where: [{ field: 'id', value: teamId }],
  })
  teamsDeleted++

  return { teamsDeleted, grantsDeleted, deniesDeleted }
}

export const teamEndpoints = (config?: TenancyConfig) => ({
  createTeam: createAuthEndpoint(
    '/tenancy/team/create',
    {
      method: 'POST',
      body: z.object({
        parentType: z.enum(['organization', 'team']),
        parentId: z.string(),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: config?.schemas?.team?.metadata ?? z.record(z.string(), z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create team',
          description: 'Create a new team within an organization or another team (requires authentication)',
          responses: created(teamSchema, 'Team created'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.team?.create, ctx, session)

      const { parentType, parentId, name, slug, metadata } = ctx.body

      // Check limits based on parent type
      if (parentType === 'organization' && config?.limits?.maxTeamsPerOrganization) {
        const allTeams = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'parentType', value: 'organization' }, { field: 'parentId', value: parentId }],
        }) as Team[]
        if (allTeams.length >= config.limits.maxTeamsPerOrganization) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('team.limit_reached', locale, { limit: config.limits.maxTeamsPerOrganization }, config?.i18n?.errorMessages),
          })
        }
      } else if (parentType === 'team' && config?.limits?.maxChildTeamsPerTeam) {
        const allChildren = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'parentType', value: 'team' }, { field: 'parentId', value: parentId }],
        }) as Team[]
        if (allChildren.length >= config.limits.maxChildTeamsPerTeam) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('team.limit_reached', locale, { limit: config.limits.maxChildTeamsPerTeam }, config?.i18n?.errorMessages),
          })
        }
      }

      // Check nesting depth limit
      if (config?.limits?.maxNestingDepth) {
        const depth = await computeNestingDepth(ctx.context.adapter, parentType, parentId)
        if (depth >= config.limits.maxNestingDepth) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('team.nesting_depth_exceeded', locale, { limit: config.limits.maxNestingDepth }, config?.i18n?.errorMessages),
          })
        }
      }

      // Check slug uniqueness within the same parent
      const siblings = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'parentType', value: parentType }, { field: 'parentId', value: parentId }],
      }) as Team[]
      const existing = siblings.find((t) => t.slug === slug)
      if (existing) {
        const acceptLanguage = getLocaleFromHeaders(ctx.headers)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage('team.slug_exists', acceptLanguage, { slug }, config?.i18n?.errorMessages),
        })
      }

      const team = await ctx.context.adapter.create({
        model: 'team',
        data: { parentType, parentId, name, slug, metadata },
      }) as Team

      const eventData = {
        entityType: 'team' as const,
        entityId: team.id,
        entityName: team.name,
        parentContext: { type: parentType as 'organization' | 'team', id: parentId },
        createdBy,
        metadata: team.metadata ?? undefined,
        timestamp: new Date(),
      }

      if (config?.actions?.onEntityCreated) {
        try {
          await config.actions.onEntityCreated(eventData, ctx)
        } catch (error) {
          await ctx.context.adapter.delete({
            model: 'team',
            where: [{ field: 'id', value: team.id }],
          })
          throw error
        }
      }

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated(eventData)
      }

      return ctx.json(team, { status: 201 })
    }
  ),

  getTeam: createAuthEndpoint(
    '/tenancy/team/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get team',
          description: 'Get team by ID',
          responses: ok(teamSchema, 'The team'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.team?.read, ctx, session)

      const { id } = ctx.params

      const team = await ctx.context.adapter.findOne({
        model: 'team',
        where: [{ field: 'id', value: id }],
      }) as Team | null

      if (!team) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }
      return ctx.json(team)
    }
  ),

  getTeamBySlug: createAuthEndpoint(
    '/tenancy/team/:parentType/:parentId/by-slug/:slug',
    {
      method: 'GET',
      params: z.object({
        parentType: z.enum(['organization', 'team']),
        parentId: z.string(),
        slug: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Get team by slug',
          description: 'Get team by slug within a parent context',
          responses: ok(teamSchema, 'The team'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.team?.read, ctx, session)

      const { parentType, parentId, slug } = ctx.params
      const teams = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'parentType', value: parentType }, { field: 'parentId', value: parentId }],
      }) as Team[]
      const team = teams.find((t) => t.slug === slug)

      if (!team) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id: slug }, config?.i18n?.errorMessages)
        })
      }
      return ctx.json(team)
    }
  ),

  updateTeam: createAuthEndpoint(
    '/tenancy/team/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
        metadata: config?.schemas?.team?.metadata?.optional() ?? z.record(z.string(), z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Update team',
          description: 'Update an existing team (requires authentication)',
          responses: ok(teamSchema, 'Updated team'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.team?.update, ctx, session)

      const { id, name, slug, metadata } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'team',
        where: [{ field: 'id', value: id }],
      }) as Team | null
      if (!current) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      if (slug && slug !== current.slug) {
        const siblings = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'parentType', value: current.parentType }, { field: 'parentId', value: current.parentId }],
        }) as Team[]
        const existing = siblings.find((t) => t.slug === slug && t.id !== id)
        if (existing) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('team.slug_exists', locale, { slug }, config?.i18n?.errorMessages),
          })
        }
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {}
      if (name && name !== current.name) changes.name = { old: current.name, new: name }
      if (slug && slug !== current.slug) changes.slug = { old: current.slug, new: slug }
      if (metadata) changes.metadata = { old: current.metadata, new: metadata }

      const updated = await ctx.context.adapter.update({
        model: 'team',
        where: [{ field: 'id', value: id }],
        update: { name, slug, metadata },
      }) as Team

      if (Object.keys(changes).length > 0 && config?.audit?.onEntityUpdated) {
        await config.audit.onEntityUpdated({
          entityType: 'team',
          entityId: id,
          changes,
          updatedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  deleteTeam: createAuthEndpoint(
    '/tenancy/team/delete',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Delete team',
          description: 'Delete team and all related entities recursively (requires authentication)',
          responses: noContent('Team deleted'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.team?.delete, ctx, session)

      const { id } = ctx.body

      const team = await ctx.context.adapter.findOne({
        model: 'team',
        where: [{ field: 'id', value: id }],
      }) as Team | null
      if (!team) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      const result = await deleteTeamRecursive(ctx.context.adapter, id, config)

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'team',
          entityId: id,
          entityName: team.name,
          deletedBy,
          metadata: {
            teamsDeleted: result.teamsDeleted,
            permissionsDeleted: {
              grants: result.grantsDeleted,
              denies: result.deniesDeleted,
            },
          },
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  listTeamsByParent: createAuthEndpoint(
    '/tenancy/team/list',
    {
      method: 'GET',
      query: z.object({
        parentType: z.enum(['organization', 'team']),
        parentId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        orderBy: z.enum(['createdAt', 'name']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List teams',
          description: 'List all teams under a parent. When permission filtering is configured, returns all filtered items without pagination.',
          responses: okList(teamSchema, 'List of teams'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.team?.list, ctx, session)

      const { parentType, parentId, limit = 50, offset = 0, orderBy, orderDirection } = ctx.query

      const where = [
        { field: 'parentType', value: parentType },
        { field: 'parentId', value: parentId },
      ]

      // If no permission filtering, use efficient pagination
      if (!config?.permissionFiltering?.filterTeams) {
        const [items, total] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'team',
            where,
            limit,
            offset,
            sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
          }) as Promise<Team[]>,
          ctx.context.adapter.count({
            model: 'team',
            where,
          })
        ])

        return ctx.json({ items, total, limit, offset })
      }

      // With permission filtering: fetch ALL, filter, return all filtered items (no pagination)
      let items = await ctx.context.adapter.findMany({
        model: 'team',
        where,
        sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
      }) as Team[]

      items = await config.permissionFiltering.filterTeams(ctx, items, { parentType, parentId })
      const total = items.length

      return ctx.json({ items, total })
    }
  ),
})
