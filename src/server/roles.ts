import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { OrganizationRole, TeamRole } from '../schema'
import type { TenancyConfig, ResourceContext } from '../types/config'
import type { StatementId } from '../types'
import { applyEndpointAuth, requireSession } from './middleware'

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
}

export interface UpdateRoleInput {
  name?: string
  description?: string
}

export const roleEndpoints = (config?: TenancyConfig) => ({
  createRole: createAuthEndpoint(
    '/tenancy/role/create',
    {
      method: 'POST',
      body: z.object({
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        name: z.string().min(1).max(100),
        description: z.string().optional(),
        statements: z.array(z.string()).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Create role',
          description: 'Create a new role within an organization or team (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.role?.create, ctx, session)

      const { contextType, contextId, name, description, statements } = ctx.body

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
    '/tenancy/role/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get role',
          description: 'Get role by ID',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)

      const { id } = ctx.params

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      await applyEndpointAuth(config?.endpoints?.role?.read, {
        ...ctx,
        resource,
      }, session)

      const role = resource.data as OrganizationRole | TeamRole
      const isOrgRole = resource.contextType === 'organization'
      const relationModel = isOrgRole ? 'organizationRoleStatement' : 'teamRoleStatement'

      // Fetch role-statement relations
      const roleStatements = await ctx.context.adapter.findMany({
        model: relationModel,
        where: [{ field: 'roleId', value: role.id }],
      }) as any[]

      // Batch fetch all statements for better performance
      const statementIds = roleStatements.map(rs => rs.statementId)
      const statementsPromises = statementIds.map(statementId =>
        ctx.context.adapter.findOne({
          model: 'statement',
          where: [{ field: 'id', value: statementId }],
        }).catch(() => null)
      )
      const statementsArray = await Promise.all(statementsPromises) as any[]

      const statements = statementsArray
        .filter(Boolean)
        .map(s => ({
          id: s.id,
          category: s.category,
          operation: s.operation,
          description: s.description,
        }))

      return ctx.json({
        ...role,
        statements,
        statementCount: statements.length,
      })
    }
  ),

  updateRole: createAuthEndpoint(
    '/tenancy/role/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Update role',
          description: 'Update an existing role (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      const { id, name, description } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

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
    '/tenancy/role/delete',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Delete role',
          description: 'Delete a role (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      const { id } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

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
    '/tenancy/role/list',
    {
      method: 'GET',
      query: z.object({
        contextType: z.enum(['organization', 'team']),
        contextId: z.string(),
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
        includeStatements: z.coerce.boolean().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List roles',
          description: 'List all roles in a context with pagination. Use includeStatements=true to include full statement details.',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.role?.list, ctx, session)

      const { contextType, contextId, limit = 50, offset = 0, includeStatements = false } = ctx.query

      const model = contextType === 'organization' ? 'organizationRole' : 'teamRole'
      const field = contextType === 'organization' ? 'organizationId' : 'teamId'

      let items = await ctx.context.adapter.findMany({
        model,
        where: [{ field, value: contextId }],
      }) as (OrganizationRole | TeamRole)[]

      const total = items.length

      items = items.slice(offset, offset + limit)

      // Conditionally enrich roles with their statements
      if (includeStatements) {
        const isOrgRole = contextType === 'organization'
        const relationModel = isOrgRole ? 'organizationRoleStatement' : 'teamRoleStatement'

        // Batch fetch all role-statement relations for all roles
        const roleIds = items.map(r => r.id)
        const allRoleStatementsPromises = roleIds.map(roleId =>
          ctx.context.adapter.findMany({
            model: relationModel,
            where: [{ field: 'roleId', value: roleId }],
          }).catch(() => [])
        )
        const allRoleStatementsArrays = await Promise.all(allRoleStatementsPromises) as any[][]

        // Flatten and get unique statement IDs
        const allRoleStatements = allRoleStatementsArrays.flat()
        const statementIds = [...new Set(allRoleStatements.map((rs: any) => rs.statementId))]

        // Batch fetch all statements
        const statementsPromises = statementIds.map(statementId =>
          ctx.context.adapter.findOne({
            model: 'statement',
            where: [{ field: 'id', value: statementId }],
          }).catch(() => null)
        )
        const statementsArray = await Promise.all(statementsPromises) as any[]
        const statementMap = new Map(
          statementsArray.filter(Boolean).map(s => [s.id, {
            id: s.id,
            category: s.category,
            operation: s.operation,
            description: s.description,
          }])
        )

        // Build role -> statements mapping
        const roleStatementsMap = new Map<string, any[]>()
        allRoleStatementsArrays.forEach((roleStatements, index) => {
          const roleId = roleIds[index]
          if (roleId) {
            const statements = roleStatements
              .map((rs: any) => statementMap.get(rs.statementId))
              .filter(Boolean)
            roleStatementsMap.set(roleId, statements)
          }
        })

        // Enrich roles with their statements
        const enrichedItems = items.map((role) => {
          const statements = roleStatementsMap.get(role.id) || []
          return {
            ...role,
            statements,
            statementCount: statements.length,
          }
        })

        return ctx.json({ items: enrichedItems, total, limit, offset })
      }

      return ctx.json({ items, total, limit, offset })
    }
  ),

  addStatementToRole: createAuthEndpoint(
    '/tenancy/role/statement/add',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        statementId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Add statement to role',
          description: 'Add a statement to a role (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const addedBy = session.user.id

      const { id, statementId } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      await applyEndpointAuth(config?.endpoints?.role?.addStatement, {
        ...ctx,
        resource,
      }, session)

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
    '/tenancy/role/statement/remove',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        statementId: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Remove statement from role',
          description: 'Remove a statement from a role (requires authentication)',
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const removedBy = session.user.id

      const { id, statementId } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        throw new APIError('NOT_FOUND', { message: 'Role not found' })
      }

      await applyEndpointAuth(config?.endpoints?.role?.removeStatement, {
        ...ctx,
        resource,
      }, session)

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

