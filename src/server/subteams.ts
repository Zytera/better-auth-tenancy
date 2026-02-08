import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Subteam } from '../schema'
import type { TenancyConfig } from '../types'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth, requireSession } from './middleware'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'

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
        metadata: config?.schemas?.subteam?.metadata ?? z.record(z.unknown()).optional(),
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
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('subteam.limit_reached', locale, undefined, config?.i18n?.errorMessages)
          })
        }
      }

      const subteams = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: teamId }],
      }) as Subteam[]
      const existing = subteams.find((s) => s.slug === slug)
      if (existing) {
        const acceptLanguage = getLocaleFromHeaders(ctx.headers)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage('subteam.slug_exists', acceptLanguage, { slug }, config?.i18n?.errorMessages)
        })
      }

      const subteam = await ctx.context.adapter.create({
        model: 'subteam',
        data: { teamId, name, slug, metadata },
      }) as Subteam

      const eventData = {
        entityType: 'subteam' as const,
        entityId: subteam.id,
        entityName: subteam.name,
        parentContext: { type: 'team' as const, id: teamId },
        createdBy,
        metadata: subteam.metadata ?? undefined,
        timestamp: new Date(),
      }

      if (config?.actions?.onEntityCreated) {
        try {
          await config.actions.onEntityCreated(eventData, ctx)
        } catch (error) {
          await ctx.context.adapter.delete({
            model: 'subteam',
            where: [{ field: 'id', value: subteam.id }],
          })
          throw error
        }
      }

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated(eventData)
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

      if (!subteam) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('subteam.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }
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
        metadata: config?.schemas?.subteam?.metadata?.optional() ?? z.record(z.unknown()).optional(),
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
      if (!current) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('subteam.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      if (slug && slug !== current.slug) {
        const subteams = await ctx.context.adapter.findMany({
          model: 'subteam',
          where: [{ field: 'teamId', value: current.teamId }],
        }) as Subteam[]
        const existing = subteams.find((s) => s.slug === slug && s.id !== id)
        if (existing) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('subteam.slug_exists', locale, { slug }, config?.i18n?.errorMessages)
          })
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
      if (!subteam) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('subteam.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      // Delete subteam members
      await ctx.context.adapter.delete({
        model: 'subteamMember',
        where: [{ field: 'subteamId', value: id }],
      })

      // Delete subteam invitations
      await ctx.context.adapter.delete({
        model: 'invitation',
        where: [
          { field: 'contextType', value: 'subteam' },
          { field: 'contextId', value: id },
        ],
      })

      // Delete subteam permissions
      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'subteam', id)

      // Finally delete the subteam
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
          description: 'List all subteams in a team. When permission filtering is configured, returns all filtered items without pagination.',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.subteam?.list, ctx, session)

      const { teamId, limit = 50, offset = 0 } = ctx.query

      const where = [{ field: 'teamId', value: teamId }]

      // If no permission filtering, use efficient pagination
      if (!config?.permissionFiltering?.filterSubteams) {
        const [items, total] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'subteam',
            where,
            limit,
            offset,
          }) as Promise<Subteam[]>,
          ctx.context.adapter.count({
            model: 'subteam',
            where,
          })
        ])

        return ctx.json({ items, total, limit, offset })
      }

      // With permission filtering: fetch ALL, filter, return all filtered items (no pagination)
      let items = await ctx.context.adapter.findMany({
        model: 'subteam',
        where,
      }) as Subteam[]

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

      const total = items.length

      return ctx.json({ items, total })
    }
  ),
})

