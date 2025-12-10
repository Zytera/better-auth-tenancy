import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Team } from '../schema'
import type { TenancyConfig } from '../types/config'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth, requireSession } from './middleware'

export interface CreateTeamInput {
  organizationId: string
  name: string
  slug: string
  metadata?: Record<string, unknown>
}

export interface UpdateTeamInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
}

export const teamEndpoints = (config?: TenancyConfig) => ({
  createTeam: createAuthEndpoint(
    '/tenancy/team/create',
    {
      method: 'POST',
      body: z.object({
        organizationId: z.string(),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create team',
          description: 'Create a new team within an organization (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.team?.create, ctx, session)

      const { organizationId, name, slug, metadata } = ctx.body

      if (config?.limits?.maxTeamsPerOrganization) {
        const allTeams = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'organizationId', value: organizationId }],
        }) as Team[]
        if (allTeams.length >= config.limits.maxTeamsPerOrganization) {
          throw new APIError('BAD_REQUEST', {
            message: `Organization has reached maximum number of teams (${config.limits.maxTeamsPerOrganization})`,
          })
        }
      }

      const teamsByOrg = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'organizationId', value: organizationId }],
      }) as Team[]
      const existing = teamsByOrg.find((t) => t.slug === slug)
      if (existing) {
        throw new APIError('BAD_REQUEST', {
          message: `Team with slug "${slug}" already exists in this organization`,
        })
      }

      const team = await ctx.context.adapter.create({
        model: 'team',
        data: { organizationId, name, slug, metadata },
      }) as Team

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated({
          entityType: 'team',
          entityId: team.id,
          entityName: team.name,
          parentContext: { type: 'organization', id: organizationId },
          createdBy,
          metadata: team.metadata ?? undefined,
          timestamp: new Date(),
        })
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

      if (!team) throw new APIError('NOT_FOUND', { message: 'Team not found' })
      return ctx.json(team)
    }
  ),

  getTeamBySlug: createAuthEndpoint(
    '/tenancy/team/:organizationId/by-slug/:slug',
    {
      method: 'GET',
      params: z.object({
        organizationId: z.string(),
        slug: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Get team by slug',
          description: 'Get team by slug within organization',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.team?.read, ctx, session)

      const { organizationId, slug } = ctx.params
      const teams = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'organizationId', value: organizationId }],
      }) as Team[]
      const team = teams.find((t) => t.slug === slug)

      if (!team) throw new APIError('NOT_FOUND', { message: 'Team not found' })
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
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Update team',
          description: 'Update an existing team (requires authentication)',
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
      if (!current) throw new APIError('NOT_FOUND', { message: `Team with id "${id}" not found` })

      if (slug && slug !== current.slug) {
        const teams = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'organizationId', value: current.organizationId }],
        }) as Team[]
        const existing = teams.find((t) => t.slug === slug && t.id !== id)
        if (existing) {
          throw new APIError('BAD_REQUEST', {
            message: `Team with slug "${slug}" already exists in this organization`,
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
          description: 'Delete team and all related entities (requires authentication)',
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
      if (!team) throw new APIError('NOT_FOUND', { message: `Team with id "${id}" not found` })

      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'team', id)

      await ctx.context.adapter.delete({
        model: 'team',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'team',
          entityId: id,
          entityName: team.name,
          deletedBy,
          metadata: {
            permissionsDeleted: {
              grants: cleanup.grantsDeleted,
              denies: cleanup.deniesDeleted,
            },
          },
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  listTeamsByOrganization: createAuthEndpoint(
    '/tenancy/team/list',
    {
      method: 'GET',
      query: z.object({
        organizationId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        orderBy: z.enum(['createdAt', 'name']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List teams',
          description: 'List all teams in an organization. When permission filtering is configured, returns all filtered items without pagination.',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.team?.list, ctx, session)

      const { organizationId, limit = 50, offset = 0, orderBy, orderDirection } = ctx.query

      const where = [{ field: 'organizationId', value: organizationId }]

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
      }) as Promise<Team[]>

      items = await config.permissionFiltering.filterTeams(ctx, items, { organizationId })
      const total = items.length

      return ctx.json({ items, total })
    }
  ),
})

