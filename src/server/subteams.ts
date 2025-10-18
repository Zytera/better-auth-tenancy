import { z } from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import type { Subteam } from '../schema'
import type { TenancyConfig } from '../types/config'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth } from './middleware'

export interface CreateSubteamInput {
  teamId: string
  name: string
  slug: string
  metadata?: Record<string, unknown>
  createdBy: string
}

export interface UpdateSubteamInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
  updatedBy: string
}

export const subteamEndpoints = (config?: TenancyConfig) => ({
  createSubteam: createAuthEndpoint(
    '/subteam/create',
    {
      method: 'POST',
      body: z.object({
        teamId: z.string(),
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: z.record(z.unknown()).optional(),
        createdBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Create subteam',
          description: 'Create a new subteam within a team',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.subteam?.create, ctx)

      const { teamId, name, slug, metadata, createdBy } = ctx.body

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
    '/subteam/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get subteam',
          description: 'Get subteam by ID',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.subteam?.read, ctx)

      const subteam = await ctx.context.adapter.findOne({
        model: 'subteam',
        where: [{ field: 'id', value: ctx.params.id }],
      }) as Subteam | null

      if (!subteam) throw new APIError('NOT_FOUND', { message: 'Subteam not found' })
      return ctx.json(subteam)
    }
  ),

  updateSubteam: createAuthEndpoint(
    '/subteam/:id',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
        metadata: z.record(z.unknown()).optional(),
        updatedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Update subteam',
          description: 'Update an existing subteam',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.subteam?.update, ctx)

      const { id } = ctx.params
      const { name, slug, metadata, updatedBy } = ctx.body

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
    '/subteam/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      body: z.object({ deletedBy: z.string() }),
      metadata: {
        openapi: {
          summary: 'Delete subteam',
          description: 'Delete subteam and all related entities',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.subteam?.delete, ctx)

      const { id } = ctx.params
      const { deletedBy } = ctx.body

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
    '/subteam/list/:teamId',
    {
      method: 'GET',
      params: z.object({ teamId: z.string() }),
      query: z.object({
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
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.subteam?.list, ctx)

      const { teamId } = ctx.params
      const { limit = 50, offset = 0 } = ctx.query

      const items = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: teamId }],
        limit,
        offset,
      }) as Subteam[]

      const allSubteams = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: teamId }],
      }) as Subteam[]
      const total = allSubteams.length

      return ctx.json({ items, total, limit, offset })
    }
  ),
})

