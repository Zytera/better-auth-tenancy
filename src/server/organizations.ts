import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Organization } from '../schema'
import type { TenancyConfig } from '../types/config'
import { cleanupContextPermissions } from './permissions'
import { applyEndpointAuth, requireSession } from './middleware'

export interface CreateOrganizationInput {
  name: string
  slug: string
  metadata?: Record<string, unknown>
  // Note: createdBy is automatically obtained from authenticated session
}

export interface UpdateOrganizationInput {
  name?: string
  slug?: string
  metadata?: Record<string, unknown>
  // Note: updatedBy is automatically obtained from authenticated session
}

export const organizationEndpoints = (config?: TenancyConfig) => ({
  createOrganization: createAuthEndpoint(
    '/organization/create',
    {
      method: 'POST',
      body: z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
        metadata: z.record(z.unknown()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create organization',
          description: 'Create a new organization (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication (supports both cookies and Bearer tokens)
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      // Apply authorization hook if configured (pass session to avoid re-fetch)
      await applyEndpointAuth(config?.endpoints?.organization?.create, ctx, session)

      const { name, slug, metadata } = ctx.body

      const existing = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'slug', value: slug }],
      }) as Organization | null
      if (existing) throw new APIError('BAD_REQUEST', { message: `Organization with slug "${slug}" already exists` })

      const organization = await ctx.context.adapter.create({
        model: 'organization',
        data: { name, slug, metadata },
      }) as Organization

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated({
          entityType: 'organization',
          entityId: organization.id,
          entityName: organization.name,
          createdBy,
          metadata: organization.metadata ?? undefined,
          timestamp: new Date(),
        })
      }

      return ctx.json(organization, { status: 201 })
    }
  ),

  getOrganization: createAuthEndpoint(
    '/organization/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get organization',
          description: 'Get organization by ID',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.organization?.read, ctx, session)

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: ctx.params.id }],
      }) as Organization | null

      if (!organization) throw new APIError('NOT_FOUND', { message: 'Organization not found' })
      return ctx.json(organization)
    }
  ),

  getOrganizationBySlug: createAuthEndpoint(
    '/organization/by-slug/:slug',
    {
      method: 'GET',
      params: z.object({ slug: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get organization by slug',
          description: 'Get organization by unique slug',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.organization?.read, ctx, session)

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'slug', value: ctx.params.slug }],
      }) as Organization | null

      if (!organization) throw new APIError('NOT_FOUND', { message: 'Organization not found' })
      return ctx.json(organization)
    }
  ),

  updateOrganization: createAuthEndpoint(
    '/organization/:id',
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
          summary: 'Update organization',
          description: 'Update an existing organization (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication (supports both cookies and Bearer tokens)
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      // Apply authorization hook if configured (pass session to avoid re-fetch)
      await applyEndpointAuth(config?.endpoints?.organization?.update, ctx, session)

      const { id } = ctx.params
      const { name, slug, metadata } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      }) as Organization | null
      if (!current) throw new APIError('NOT_FOUND', { message: `Organization with id "${id}" not found` })

      if (slug && slug !== current.slug) {
        const existing = await ctx.context.adapter.findOne({
          model: 'organization',
          where: [{ field: 'slug', value: slug }],
        }) as Organization | null
        if (existing) throw new APIError('BAD_REQUEST', { message: `Organization with slug "${slug}" already exists` })
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
    '/organization/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Delete organization',
          description: 'Delete organization and all related entities (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication (supports both cookies and Bearer tokens)
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      // Apply authorization hook if configured (pass session to avoid re-fetch)
      await applyEndpointAuth(config?.endpoints?.organization?.delete, ctx, session)

      const { id } = ctx.params

      const organization = await ctx.context.adapter.findOne({
        model: 'organization',
        where: [{ field: 'id', value: id }],
      }) as Organization | null
      if (!organization) throw new APIError('NOT_FOUND', { message: `Organization with id "${id}" not found` })

      const cleanup = await cleanupContextPermissions(ctx.context.adapter, 'organization', id)

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
    '/organization/list',
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
          description: 'List all organizations with pagination and sorting',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.organization?.list, ctx, session)

      const { limit = 50, offset = 0, orderBy, orderDirection } = ctx.query

      // Get all organizations first
      let items = await ctx.context.adapter.findMany({
        model: 'organization',
        sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
      }) as Organization[]

      // Apply permission filtering if configured
      if (config?.permissionFiltering?.filterOrganizations) {
        items = await config.permissionFiltering.filterOrganizations(ctx, items)
      }

      const total = items.length

      // Apply pagination after filtering
      items = items.slice(offset, offset + limit)

      return ctx.json({ items, total, limit, offset })
    }
  ),
})

