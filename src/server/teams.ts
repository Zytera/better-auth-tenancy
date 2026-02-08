import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Team } from '../schema'
import type { TenancyConfig } from '../types'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth, requireSession } from './middleware'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'

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
        metadata: config?.schemas?.team?.metadata ?? z.record(z.unknown()).optional(),
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
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('team.limit_reached', locale, { limit: config.limits.maxTeamsPerOrganization }, config?.i18n?.errorMessages),
          })
        }
      }

      const teamsByOrg = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'organizationId', value: organizationId }],
      }) as Team[]
      const existing = teamsByOrg.find((t) => t.slug === slug)
      if (existing) {
        const acceptLanguage = getLocaleFromHeaders(ctx.headers)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage('team.slug_exists', acceptLanguage, { slug }, config?.i18n?.errorMessages),
        })
      }

      const team = await ctx.context.adapter.create({
        model: 'team',
        data: { organizationId, name, slug, metadata },
      }) as Team

      const eventData = {
        entityType: 'team' as const,
        entityId: team.id,
        entityName: team.name,
        parentContext: { type: 'organization' as const, id: organizationId },
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
        metadata: config?.schemas?.team?.metadata?.optional() ?? z.record(z.unknown()).optional(),
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
      if (!current) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      if (slug && slug !== current.slug) {
        const teams = await ctx.context.adapter.findMany({
          model: 'team',
          where: [{ field: 'organizationId', value: current.organizationId }],
        }) as Team[]
        const existing = teams.find((t) => t.slug === slug && t.id !== id)
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
      if (!team) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('team.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      // Cascade delete: Subteams and their members/invitations
      const subteams = await ctx.context.adapter.findMany({
        model: 'subteam',
        where: [{ field: 'teamId', value: id }],
      }) as any[]
      for (const subteam of subteams) {
        // Delete subteam members
        await ctx.context.adapter.delete({
          model: 'subteamMember',
          where: [{ field: 'subteamId', value: subteam.id }],
        })

        // Delete subteam invitations
        await ctx.context.adapter.delete({
          model: 'invitation',
          where: [
            { field: 'contextType', value: 'subteam' },
            { field: 'contextId', value: subteam.id },
          ],
        })

        // Delete subteam permissions
        await cleanupContextPermissions(ctx.context.adapter, 'subteam', subteam.id)

        // Delete subteam
        await ctx.context.adapter.delete({
          model: 'subteam',
          where: [{ field: 'id', value: subteam.id }],
        })
      }

      // Delete team roles and their statements
      const teamRoles = await ctx.context.adapter.findMany({
        model: 'teamRole',
        where: [{ field: 'teamId', value: id }],
      }) as any[]

      for (const role of teamRoles) {
        await ctx.context.adapter.delete({
          model: 'teamRoleStatement',
          where: [{ field: 'roleId', value: role.id }],
        })
        await ctx.context.adapter.delete({
          model: 'teamRole',
          where: [{ field: 'id', value: role.id }],
        })
      }

      // Delete team members
      await ctx.context.adapter.delete({
        model: 'teamMember',
        where: [{ field: 'teamId', value: id }],
      })

      // Delete team invitations
      await ctx.context.adapter.delete({
        model: 'invitation',
        where: [
          { field: 'contextType', value: 'team' },
          { field: 'contextId', value: id },
        ],
      })

      // Delete team permissions
      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'team', id)

      // Finally delete the team
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
            subteamsDeleted: subteams.length,
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
      }) as Team[]

      items = await config.permissionFiltering.filterTeams(ctx, items, { organizationId })
      const total = items.length

      return ctx.json({ items, total })
    }
  ),
})

