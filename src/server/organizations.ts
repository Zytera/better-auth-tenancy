import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Organization } from '../schema'
import type { TenancyConfig } from '../types'
import { cleanupContextPermissions } from './permissions'
import { deleteTeamRecursive } from './teams'
import { applyEndpointAuth, requireSession } from './middleware'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'

export interface CreateOrganizationInput {
  name: string
  slug: string
  metadata?: Record<string, unknown>
}

export interface UpdateOrganizationInput {
  id: string
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
}

export const organizationEndpoints = (config?: TenancyConfig) => ({
  createOrganization: createAuthEndpoint(
    '/tenancy/organization/create',
    {
      method: 'POST',
      body: z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: config?.schemas?.organization?.metadata ?? z.record(z.string(), z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create organization',
          description: 'Create a new organization (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.organization?.create, ctx, session)

      const { name, slug, metadata } = ctx.body

      const existing = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'slug', value: slug }],
      }) as Organization | null
      if (existing) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage('organization.slug_exists', locale, { slug }, config?.i18n?.errorMessages)
        })
      }

      const organization = await ctx.context.adapter.create({
        model: 'organization',
        data: { name, slug, metadata },
      }) as Organization

      const eventData = {
        entityType: 'organization' as const,
        entityId: organization.id,
        entityName: organization.name,
        createdBy,
        metadata: organization.metadata ?? undefined,
        timestamp: new Date(),
      }

      if (config?.actions?.onEntityCreated) {
        try {
          await config.actions.onEntityCreated(eventData, ctx)
        } catch (error) {
          await ctx.context.adapter.delete({
            model: 'organization',
            where: [{ field: 'id', value: organization.id }],
          })
          throw error
        }
      }

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated(eventData)
      }

      return ctx.json(organization, { status: 201 })
    }
  ),

  getOrganization: createAuthEndpoint(
    '/tenancy/organization/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get organization',
          description: 'Get organization by ID',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.organization?.read, ctx, session)

      const { id } = ctx.params

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      }) as Organization | null

      if (!organization) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('organization.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }
      return ctx.json(organization)
    }
  ),

  getOrganizationBySlug: createAuthEndpoint(
    '/tenancy/organization/by-slug/:slug',
    {
      method: 'GET',
      params: z.object({
        slug: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get organization by slug',
          description: 'Get organization by unique slug',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.organization?.read, ctx, session)

      const { slug } = ctx.params

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'slug', value: slug }],
      }) as Organization | null

      if (!organization) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('organization.not_found', locale, { id: slug }, config?.i18n?.errorMessages)
        })
      }
      return ctx.json(organization)
    }
  ),

  updateOrganization: createAuthEndpoint(
    '/tenancy/organization/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/).optional(),
        metadata: config?.schemas?.organization?.metadata?.optional() ?? z.record(z.string(), z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Update organization',
          description: 'Update an existing organization (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.organization?.update, ctx, session)

      const { id, name, slug, metadata } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      }) as Organization | null
      if (!current) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('organization.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      if (slug && slug !== current.slug) {
        const existing = await ctx.context.adapter.findOne({
          model: 'organization',
          where: [{ field: 'slug', value: slug }],
        }) as Organization | null
        if (existing) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('organization.slug_exists', locale, { slug }, config?.i18n?.errorMessages)
          })
        }
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {}
      if (name && name !== current.name) changes.name = { old: current.name, new: name }
      if (slug && slug !== current.slug) changes.slug = { old: current.slug, new: slug }
      if (metadata) changes.metadata = { old: current.metadata, new: metadata }

      const updated = await ctx.context.adapter.update({
        model: 'organization',
        where: [{ field: 'id', value: id }],
        update: { name, slug, metadata },
      }) as Organization

      if (Object.keys(changes).length > 0 && config?.audit?.onEntityUpdated) {
        await config.audit.onEntityUpdated({
          entityType: 'organization',
          entityId: id,
          changes,
          updatedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  deleteOrganization: createAuthEndpoint(
    '/tenancy/organization/delete',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Delete organization',
          description: 'Delete organization and all related entities (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.organization?.delete, ctx, session)

      const { id } = ctx.body

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      }) as Organization | null
      if (!organization) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('organization.not_found', locale, { id }, config?.i18n?.errorMessages)
        })
      }

      // Cascade delete: Teams (recursively deletes child teams, members, etc.)
      const teams = await ctx.context.adapter.findMany({
        model: 'team',
        where: [{ field: 'parentType', value: 'organization' }, { field: 'parentId', value: id }],
      }) as any[]

      for (const team of teams) {
        await deleteTeamRecursive(ctx.context.adapter, team.id, config)
      }

      // Delete organization roles and their statements
      const orgRoles = await ctx.context.adapter.findMany({
        model: 'role',
        where: [{ field: 'contextType', value: 'organization' }, { field: 'contextId', value: id }],
      }) as any[]

      for (const role of orgRoles) {
        await ctx.context.adapter.delete({
          model: 'roleStatement',
          where: [{ field: 'roleId', value: role.id }],
        })
        await ctx.context.adapter.delete({
          model: 'role',
          where: [{ field: 'id', value: role.id }],
        })
      }

      // Delete organization members
      await ctx.context.adapter.delete({
        model: 'member',
        where: [{ field: 'contextType', value: 'organization' }, { field: 'contextId', value: id }],
      })

      // Delete organization invitations
      await ctx.context.adapter.delete({
        model: 'invitation',
        where: [
          { field: 'contextType', value: 'organization' },
          { field: 'contextId', value: id },
        ],
      })

      // Delete organization permissions
      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'organization', id)

      // Finally delete the organization
      await ctx.context.adapter.delete({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'organization',
          entityId: id,
          entityName: organization.name,
          deletedBy,
          metadata: {
            teamsDeleted: teams.length,
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

  listOrganizations: createAuthEndpoint(
    '/tenancy/organization/list',
    {
      method: 'GET',
      query: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        orderBy: z.enum(['createdAt', 'name']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List organizations',
          description: 'List all organizations. When permission filtering is configured, returns all filtered items without pagination.',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.organization?.list, ctx, session)

      const { limit = 50, offset = 0, orderBy, orderDirection } = ctx.query

      // If no permission filtering, use efficient pagination
      if (!config?.permissionFiltering?.filterOrganizations) {
        const [items, total] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'organization',
            limit,
            offset,
            sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
          }) as Promise<Organization[]>,
          ctx.context.adapter.count({
            model: 'organization',
          })
        ])

        return ctx.json({ items, total, limit, offset })
      }

      // With permission filtering: fetch ALL, filter, return all filtered items (no pagination)
      let items = await ctx.context.adapter.findMany({
        model: 'organization',
        sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
      }) as Organization[]

      items = await config.permissionFiltering.filterOrganizations(ctx, items)
      const total = items.length

      return ctx.json({ items, total })
    }
  ),
})
