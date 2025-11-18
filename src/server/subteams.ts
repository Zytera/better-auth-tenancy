import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Subteam } from '../schema'
import type { TenancyConfig } from '../types/config'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth, requireSession } from './middleware'

export interface CreateSubteamInput {
  teamId: string
  name: string
  slug: string
  metadata?: Record<string, unknown>
}

export interface UpdateSubteamInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
}

export const subteamEndpoints = (config?: TenancyConfig) => ({
  createSubteam: createAuthEndpoint(
    '/tenancy/subteam/create',
    {
      method: 'POST',
      body: z.object({
        teamId: z.string(),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create subteam',
          description: 'Create a new subteam within a team (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.subteam?.create, ctx, session)

      const { teamId, name, slug, metadata } = ctx.body

      if (config?.limits?.maxSubteamsPerTeam) {
        const allSubteams = await ctx.context.adapter.findMany({
          model: 'subteam',
          where: [{ field: 'teamId', value: teamId }],
        }) as Subteam[]
        if (allSubteams.length >= config.limits.maxSubteamsPerTeam) {
          throw new APIError('BAD_REQUEST', { message: 'Team has reached maximum number of subteams' })
        }
      }

      const subteams = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: teamId }],
      }) as Subteam[]
      const existing = subteams.find((s) => s.slug === slug)
      if (existing) {
        throw new APIError('BAD_REQUEST', { message: `Subteam with slug "${slug}" already exists` })
      }

      const subteam = await ctx.context.adapter.create({
        model: 'subteam',
        data: { teamId, name, slug, metadata },
      }) as Subteam

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated({
          entityType: 'subteam',
          entityId: subteam.id,
          entityName: subteam.name,
          parentContext: { type: 'team', id: teamId },
          createdBy,
          metadata: subteam.metadata ?? undefined,
          timestamp: new Date(),
        })
      }

      return ctx.json(subteam, { status: 201 })
    }
  ),

  getSubteam: createAuthEndpoint(
    '/tenancy/subteam/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get subteam',
          description: 'Get subteam by ID',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.subteam?.read, ctx, session)

      const { id } = ctx.params

      const subteam = await ctx.context.adapter.findOne({
        model: 'subteam',
        where: [{ field: 'id', value: id }],
      }) as Subteam | null

      if (!subteam) throw new APIError('NOT_FOUND', { message: 'Subteam not found' })
      return ctx.json(subteam)
    }
  ),

  updateSubteam: createAuthEndpoint(
    '/tenancy/subteam/update',
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
          summary: 'Update subteam',
          description: 'Update an existing subteam (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.subteam?.update, ctx, session)

      const { id, name, slug, metadata } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'subteam',
        where: [{ field: 'id', value: id }],
      }) as Subteam | null
      if (!current) throw new APIError('NOT_FOUND', { message: 'Subteam not found' })

      if (slug && slug !== current.slug) {
        const subteams = await ctx.context.adapter.findMany({
          model: 'subteam',
          where: [{ field: 'teamId', value: current.teamId }],
        }) as Subteam[]
        const existing = subteams.find((s) => s.slug === slug && s.id !== id)
        if (existing) {
          throw new APIError('BAD_REQUEST', { message: `Subteam with slug "${slug}" already exists` })
        }
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {}
      if (name && name !== current.name) changes.name = { old: current.name, new: name }
      if (slug && slug !== current.slug) changes.slug = { old: current.slug, new: slug }
      if (metadata) changes.metadata = { old: current.metadata, new: metadata }

      const updated = await ctx.context.adapter.update({
        model: 'subteam',
        where: [{ field: 'id', value: id }],
        update: { name, slug, metadata },
      }) as Subteam

      if (Object.keys(changes).length > 0 && config?.audit?.onEntityUpdated) {
        await config.audit.onEntityUpdated({
          entityType: 'subteam',
          entityId: id,
          changes,
          updatedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  deleteSubteam: createAuthEndpoint(
    '/tenancy/subteam/delete',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Delete subteam',
          description: 'Delete subteam and all related entities (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.subteam?.delete, ctx, session)

      const { id } = ctx.body

      const subteam = await ctx.context.adapter.findOne({
        model: 'subteam',
        where: [{ field: 'id', value: id }],
      }) as Subteam | null
      if (!subteam) throw new APIError('NOT_FOUND', { message: 'Subteam not found' })

      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'subteam', id)

      await ctx.context.adapter.delete({
        model: 'subteam',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'subteam',
          entityId: id,
          entityName: subteam.name,
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

  listSubteamsByTeam: createAuthEndpoint(
    '/tenancy/subteam/list',
    {
      method: 'GET',
      query: z.object({
        teamId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List subteams',
          description: 'List all subteams in a team with pagination',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.subteam?.list, ctx, session)

      const { teamId, limit = 50, offset = 0 } = ctx.query

      let items = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: teamId }],
      }) as Subteam[]

      if (config?.permissionFiltering?.filterSubteams) {
        const team = await ctx.context.adapter.findOne({
          model: 'team',
          where: [{ field: 'id', value: teamId }],
        }) as any
        if (team) {
          items = await config.permissionFiltering.filterSubteams(ctx, items, {
            teamId,
            organizationId: team.organizationId
          })
        }
      }

      const total = items.length

      items = items.slice(offset, offset + limit)

      return ctx.json({ items, total, limit, offset })
    }
  ),
})

