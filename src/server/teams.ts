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
  // Note: createdBy is automatically obtained from authenticated session
}

export interface UpdateTeamInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
  // Note: updatedBy is automatically obtained from authenticated session
}

export const teamEndpoints = (config?: TenancyConfig) => ({
  createTeam: createAuthEndpoint(
    '/team/create',
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
      // Require authentication
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.team?.create, ctx, session)

      const { organizationId, name, slug, metadata } = ctx.body

      // Check limits if configured
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

      // Validate slug is unique within organization
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
    '/team/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get team',
          description: 'Get team by ID',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.team?.read, ctx, session)

      const team = await ctx.context.adapter.findOne({
        model: 'team',
        where: [{ field: 'id', value: ctx.params.id }],
      }) as Team | null

      if (!team) throw new APIError('NOT_FOUND', { message: 'Team not found' })
      return ctx.json(team)
    }
  ),

  getTeamBySlug: createAuthEndpoint(
    '/team/by-slug/:organizationId/:slug',
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
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
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
    '/team/:id',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
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
      // Require authentication
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.team?.update, ctx, session)

      const { id } = ctx.params
      const { name, slug, metadata } = ctx.body

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
    '/team/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Delete team',
          description: 'Delete team and all related entities (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.team?.delete, ctx, session)

      const { id } = ctx.params

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
    '/team/list/:organizationId',
    {
      method: 'GET',
      params: z.object({ organizationId: z.string() }),
      query: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        orderBy: z.enum(['createdAt', 'name']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List teams',
          description: 'List all teams in an organization with pagination and sorting',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.team?.list, ctx, session)

      const { organizationId } = ctx.params
      const { limit = 50, offset = 0, orderBy, orderDirection } = ctx.query

      // Get all teams first
      let items = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'organizationId', value: organizationId }],
        sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
      }) as Team[]

      // Apply permission filtering if configured and user is authenticated
      if (config?.permissionFiltering?.filterTeams && session?.user) {
        items = await config.permissionFiltering.filterTeams(session.user.id, items, { organizationId })
      }

      const total = items.length

      // Apply pagination after filtering
      items = items.slice(offset, offset + limit)

      return ctx.json({ items, total, limit, offset })
    }
  ),
})

