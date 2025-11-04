import { z } from 'zod'
import { createAuthEndpoint, APIError } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { OrganizationRole, TeamRole } from '../schema'
import type { TenancyConfig, ResourceContext } from '../types/config'
import type { StatementId } from '../types/statement'
import { applyEndpointAuth } from './middleware'

/**
 * Find role and determine its context (organization or team)
 * This helper is used to enrich endpoint hooks with resource context
 */
export async function findRoleContext(
  adapter: Adapter,
  roleId: string
): Promise<ResourceContext | null> {
  // Try organizationRole
  const orgRole = await adapter.findOne({
    model: 'organizationRole',
    where: [{ field: 'id', value: roleId }],
  }).catch(() => null) as OrganizationRole | null

  if (orgRole) {
    return {
      contextType: 'organization',
      contextId: orgRole.organizationId,
      data: orgRole,
    }
  }

  // Try teamRole
  const teamRole = await adapter.findOne({
    model: 'teamRole',
    where: [{ field: 'id', value: roleId }],
  }).catch(() => null) as TeamRole | null

  if (teamRole) {
    return {
      contextType: 'team',
      contextId: teamRole.teamId,
      data: teamRole,
    }
  }

  return null
}

export interface CreateRoleInput {
  contextType: 'organization' | 'team'
  contextId: string
  name: string
  description?: string
  statements?: StatementId[]
  createdBy: string
}

export interface UpdateRoleInput {
  name?: string
  description?: string
  updatedBy: string
}

export const roleEndpoints = (config?: TenancyConfig) => ({
  createRole: createAuthEndpoint(
    '/role/create',
    {
      method: 'POST',
      body: z.object({
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        statements: z.array(z.string()).optional(),
        createdBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Create role',
          description: 'Create a new role within an organization or team',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.role?.create, ctx)

      const { contextType, contextId, name, description, statements, createdBy } = ctx.body

      // Check limits
      const maxRoles = contextType === 'organization'
        ? config?.limits?.maxRolesPerOrganization
        : config?.limits?.maxRolesPerTeam
      if (maxRoles) {
        const model = contextType === 'organization' ? 'organizationRole' : 'teamRole'
        const field = contextType === 'organization' ? 'organizationId' : 'teamId'
        const allRoles = await ctx.context.adapter.findMany({
          model,
          where: [{ field, value: contextId }],
        }) as (OrganizationRole | TeamRole)[]
        if (allRoles.length >= maxRoles) {
          throw new APIError('BAD_REQUEST', {
            message: `Role limit reached (${maxRoles} maximum)`,
          })
        }
      }

      let role: OrganizationRole | TeamRole

      if (contextType === 'organization') {
        const orgRoles = await ctx.context.adapter.findMany({
          model: 'organizationRole',
          where: [{ field: 'organizationId', value: contextId }],
        }) as OrganizationRole[]
        if (orgRoles.find((r: OrganizationRole) => r.name === name)) {
          throw new APIError('BAD_REQUEST', {
            message: `Role "${name}" already exists`,
          })
        }
        role = await ctx.context.adapter.create({
          model: 'organizationRole',
          data: {
            organizationId: contextId,
            name,
            description,
          },
        }) as OrganizationRole

        // Add statements
        if (statements) {
          for (const sid of statements) {
            await ctx.context.adapter.create({
              model: 'organizationRoleStatement',
              data: {
                roleId: role.id,
                statementId: sid,
              },
            })
          }
        }
      } else {
        const teamRoles = await ctx.context.adapter.findMany({
          model: 'teamRole',
          where: [{ field: 'teamId', value: contextId }],
        }) as TeamRole[]
        if (teamRoles.find((r: TeamRole) => r.name === name)) {
          throw new APIError('BAD_REQUEST', {
            message: `Role "${name}" already exists`,
          })
        }
        role = await ctx.context.adapter.create({
          model: 'teamRole',
          data: {
            teamId: contextId,
            name,
            description,
          },
        }) as TeamRole

        // Add statements
        if (statements) {
          for (const sid of statements) {
            await ctx.context.adapter.create({
              model: 'teamRoleStatement',
              data: {
                roleId: role.id,
                statementId: sid,
              },
            })
          }
        }
      }

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated({
          entityType: 'role',
          entityId: role.id,
          entityName: role.name,
          parentContext: { type: contextType, id: contextId },
          createdBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(role, { status: 201 })
    }
  ),

  getRole: createAuthEndpoint(
    '/role/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get role',
          description: 'Get role by ID',
        },
      },
    },
    async (ctx) => {
      const { id } = ctx.params

      // Find role and enrich context BEFORE calling hook
      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.role?.read, {
        ...ctx,
        resource,
      })

      return ctx.json(resource.data)
    }
  ),

  updateRole: createAuthEndpoint(
    '/role/:id',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
        updatedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Update role',
          description: 'Update an existing role',
        },
      },
    },
    async (ctx) => {
      const { id } = ctx.params
      const { name, description, updatedBy } = ctx.body

      // Find role and enrich context BEFORE calling hook
      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.role?.update, {
        ...ctx,
        resource,
      })

      const current = resource.data as OrganizationRole | TeamRole
      const isOrgRole = resource.contextType === 'organization'

      const updated = await ctx.context.adapter.update({
        model: isOrgRole ? 'organizationRole' : 'teamRole',
        where: [{ field: 'id', value: id }],
        update: {
          name,
          description,
        },
      }) as OrganizationRole | TeamRole

      if (config?.audit?.onEntityUpdated) {
        const changes: Record<string, { old: unknown; new: unknown }> = {}
        if (name && name !== current.name) changes.name = { old: current.name, new: name }
        if (description !== undefined) changes.description = { old: current.description, new: description }

        if (Object.keys(changes).length > 0) {
          await config.audit.onEntityUpdated({
            entityType: 'role',
            entityId: id,
            changes,
            updatedBy,
            timestamp: new Date(),
          })
        }
      }

      return ctx.json(updated)
    }
  ),

  deleteRole: createAuthEndpoint(
    '/role/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      body: z.object({ deletedBy: z.string() }),
      metadata: {
        openapi: {
          summary: 'Delete role',
          description: 'Delete a role',
        },
      },
    },
    async (ctx) => {
      const { id } = ctx.params
      const { deletedBy } = ctx.body

      // Find role and enrich context BEFORE calling hook
      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.role?.delete, {
        ...ctx,
        resource,
      })

      const role = resource.data as OrganizationRole | TeamRole
      const isOrgRole = resource.contextType === 'organization'

      await ctx.context.adapter.delete({
        model: isOrgRole ? 'organizationRole' : 'teamRole',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'role',
          entityId: id,
          entityName: role.name,
          deletedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  listRoles: createAuthEndpoint(
    '/role/list/:contextType/:contextId',
    {
      method: 'GET',
      params: z.object({
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
      }),
      query: z.object({
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List roles',
          description: 'List all roles in a context with pagination',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.role?.list, ctx)

      const { contextType, contextId } = ctx.params
      const { limit, offset } = ctx.query

      const model = contextType === 'organization' ? 'organizationRole' : 'teamRole'
      const field = contextType === 'organization' ? 'organizationId' : 'teamId'

      let items = await ctx.context.adapter.findMany({
        model,
        where: [{ field, value: contextId }],
      }) as (OrganizationRole | TeamRole)[]

      const total = items.length
      if (offset) items = items.slice(offset)
      if (limit) items = items.slice(0, limit)

      return ctx.json({ items, total, limit: limit || total, offset: offset || 0 })
    }
  ),

  addStatementToRole: createAuthEndpoint(
    '/role/:id/statement',
    {
      method: 'POST',
      params: z.object({ id: z.string() }),
      body: z.object({
        statementId: z.string(),
        addedBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Add statement to role',
          description: 'Add a statement to a role',
        },
      },
    },
    async (ctx) => {
      const { id } = ctx.params
      const { statementId, addedBy } = ctx.body

      // Find role and enrich context BEFORE calling hook
      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.role?.addStatement, {
        ...ctx,
        resource,
      })

      const role = resource.data as OrganizationRole | TeamRole
      const isOrgRole = resource.contextType === 'organization'

      await ctx.context.adapter.create({
        model: isOrgRole ? 'organizationRoleStatement' : 'teamRoleStatement',
        data: {
          roleId: id,
          statementId,
        },
      })

      if (config?.audit?.onRoleStatementAdded) {
        await config.audit.onRoleStatementAdded({
          roleId: id,
          roleName: role.name,
          statementId,
          contextType: resource.contextType as 'organization' | 'team',
          contextId: resource.contextId,
          addedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 201 })
    }
  ),

  removeStatementFromRole: createAuthEndpoint(
    '/role/:id/statement/:statementId',
    {
      method: 'DELETE',
      params: z.object({
        id: z.string(),
        statementId: z.string(),
      }),
      body: z.object({ removedBy: z.string() }),
      metadata: {
        openapi: {
          summary: 'Remove statement from role',
          description: 'Remove a statement from a role',
        },
      },
    },
    async (ctx) => {
      const { id, statementId } = ctx.params
      const { removedBy } = ctx.body

      // Find role and enrich context BEFORE calling hook
      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      // Apply authorization hook with enriched context
      await applyEndpointAuth(config?.endpoints?.role?.removeStatement, {
        ...ctx,
        resource,
      })

      const role = resource.data as OrganizationRole | TeamRole
      const isOrgRole = resource.contextType === 'organization'

      await ctx.context.adapter.delete({
        model: isOrgRole ? 'organizationRoleStatement' : 'teamRoleStatement',
        where: [
          { field: 'roleId', value: id },
          { field: 'statementId', value: statementId },
        ],
      })

      if (config?.audit?.onRoleStatementRemoved) {
        await config.audit.onRoleStatementRemoved({
          roleId: id,
          roleName: role.name,
          statementId,
          contextType: resource.contextType as 'organization' | 'team',
          contextId: resource.contextId,
          removedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),
})

