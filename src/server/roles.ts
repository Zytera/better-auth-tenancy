import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Adapter } from 'better-auth'
import type { Role } from '../schema'
import type { TenancyConfig, ResourceContext } from '../types/config'
import type { StatementId } from '../types'
import { applyEndpointAuth, requireSession } from './middleware'
import { getErrorMessage } from '../utils/error-messages'
import { getLocaleFromHeaders } from '../utils/locale-helper'
import { ok, created, noContent, okList, roleSchema, roleWithStatementsSchema, roleListItemSchema } from './openapi'

/**
 * Find role and determine its context
 * Single query to the unified role model
 */
export async function findRoleContext(
  adapter: Adapter,
  roleId: string
): Promise<ResourceContext | null> {
  const role = await adapter.findOne({
    model: 'role',
    where: [{ field: 'id', value: roleId }],
  }).catch(() => null) as Role | null

  if (role) {
    return {
      contextType: role.contextType as 'organization' | 'team',
      contextId: role.contextId,
      data: role,
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
          responses: created(roleSchema, 'Role created'),
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
        const allRoles = await ctx.context.adapter.findMany({
          model: 'role',
          where: [{ field: 'contextType', value: contextType }, { field: 'contextId', value: contextId }],
        }) as Role[]
        if (allRoles.length >= maxRoles) {
          const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
          throw new APIError('BAD_REQUEST', {
            message: getErrorMessage('role.limit_reached', locale, { limit: maxRoles }, config?.i18n?.errorMessages),
          })
        }
      }

      // Check for duplicate name
      const existingRoles = await ctx.context.adapter.findMany({
        model: 'role',
        where: [{ field: 'contextType', value: contextType }, { field: 'contextId', value: contextId }],
      }) as Role[]
      if (existingRoles.find((r: Role) => r.name === name)) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage('role.already_exists', locale, { name }, config?.i18n?.errorMessages),
        })
      }

      const role = await ctx.context.adapter.create({
        model: 'role',
        data: {
          contextType,
          contextId,
          name,
          description,
        },
      }) as Role

      // Add statements
      if (statements) {
        for (const sid of statements) {
          await ctx.context.adapter.create({
            model: 'roleStatement',
            data: {
              roleId: role.id,
              statementId: sid,
            },
          })
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
          responses: ok(roleWithStatementsSchema, 'The role with its statements'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)

      const { id } = ctx.params

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('role.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.role?.read, {
        ...ctx,
        resource,
      }, session)

      const role = resource.data as Role

      // Fetch role-statement relations
      const roleStatements = await ctx.context.adapter.findMany({
        model: 'roleStatement',
        where: [{ field: 'roleId', value: role.id }],
      }) as any[]

      // Batch fetch all statements using 'in' operator for better performance
      const statementIds = roleStatements.map(rs => rs.statementId)

      let statementsArray: any[] = []
      if (statementIds.length > 0) {
        statementsArray = await ctx.context.adapter.findMany({
          model: 'statement',
          where: [{ field: 'id', operator: 'in', value: statementIds }],
        }) as any[]
      }

      // Fetch translations for the statements
      let translations: any[] = []
      if (statementIds.length > 0) {
        const preferredLocale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)

        translations = await ctx.context.adapter.findMany({
          model: 'statementTranslation',
          where: [
            { field: 'statementId', operator: 'in', value: statementIds },
            { field: 'locale', value: preferredLocale }
          ],
        }) as any[]

        // Fallback to English if no translations found
        if (translations.length === 0 && preferredLocale !== 'en') {
          translations = await ctx.context.adapter.findMany({
            model: 'statementTranslation',
            where: [
              { field: 'statementId', operator: 'in', value: statementIds },
              { field: 'locale', value: 'en' }
            ],
          }) as any[]
        }
      }

      const translationMap = new Map(translations.map(t => [t.statementId, t]))

      const statements = statementsArray.map(s => {
        const translation = translationMap.get(s.id)
        return {
          id: s.id,
          category: s.category,
          operation: s.operation,
          translation: translation ? {
            locale: translation.locale,
            name: translation.name,
            description: translation.description,
          } : undefined,
        }
      })

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
          responses: ok(roleSchema, 'Updated role'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      const { id, name, description } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('role.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.role?.update, {
        ...ctx,
        resource,
      }, session)

      const current = resource.data as Role

      const updated = await ctx.context.adapter.update({
        model: 'role',
        where: [{ field: 'id', value: id }],
        update: {
          name,
          description,
        },
      }) as Role

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
          responses: noContent('Role deleted'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      const { id } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('role.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.role?.delete, {
        ...ctx,
        resource,
      }, session)

      const role = resource.data as Role

      // Check if role is assigned to any members
      const members = await ctx.context.adapter.findMany({
        model: 'member',
        where: [{ field: 'roleId', value: id }],
      }) as any[]

      if (members.length > 0) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage(
            'role.delete.in_use_members',
            locale,
            { count: members.length },
            config?.i18n?.errorMessages
          ),
        })
      }

      // Delete role statements
      await ctx.context.adapter.delete({
        model: 'roleStatement',
        where: [{ field: 'roleId', value: id }],
      })

      // Delete the role
      await ctx.context.adapter.delete({
        model: 'role',
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
          responses: okList(roleListItemSchema, 'List of roles (statements/statementCount only when includeStatements=true)'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.role?.list, ctx, session)

      const { contextType, contextId, limit = 50, offset = 0, includeStatements = false } = ctx.query

      const where = [{ field: 'contextType', value: contextType }, { field: 'contextId', value: contextId }]

      // ponytail: adapter has no count(); fetch all (max 30 roles/context) then slice
      const allRoles = await ctx.context.adapter.findMany({
        model: 'role',
        where,
      }) as Role[]
      const total = allRoles.length
      const items = allRoles.slice(offset, offset + limit) as Role[]

      // Conditionally enrich roles with their statements
      if (includeStatements) {
        // Batch fetch all role-statement relations for all roles
        const roleIds = items.map(r => r.id)
        const allRoleStatementsPromises = roleIds.map(roleId =>
          ctx.context.adapter.findMany({
            model: 'roleStatement',
            where: [{ field: 'roleId', value: roleId }],
          }).catch(() => [])
        )
        const allRoleStatementsArrays = await Promise.all(allRoleStatementsPromises) as any[][]

        // Flatten and get unique statement IDs
        const allRoleStatements = allRoleStatementsArrays.flat()
        const statementIds = [...new Set(allRoleStatements.map((rs: any) => rs.statementId))]

        // Batch fetch all statements using 'in' operator
        let statementsArray: any[] = []
        if (statementIds.length > 0) {
          statementsArray = await ctx.context.adapter.findMany({
            model: 'statement',
            where: [{ field: 'id', operator: 'in', value: statementIds }],
          }) as any[]
        }

        // Fetch translations for the statements
        let translations: any[] = []
        if (statementIds.length > 0) {
          const preferredLocale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)

          translations = await ctx.context.adapter.findMany({
            model: 'statementTranslation',
            where: [
              { field: 'statementId', operator: 'in', value: statementIds },
              { field: 'locale', value: preferredLocale }
            ],
          }) as any[]

          // Fallback to English if no translations found
          if (translations.length === 0 && preferredLocale !== 'en') {
            translations = await ctx.context.adapter.findMany({
              model: 'statementTranslation',
              where: [
                { field: 'statementId', operator: 'in', value: statementIds },
                { field: 'locale', value: 'en' }
              ],
            }) as any[]
          }
        }

        const translationMap = new Map(translations.map(t => [t.statementId, t]))

        const statementMap = new Map(
          statementsArray.map(s => {
            const translation = translationMap.get(s.id)
            return [s.id, {
              id: s.id,
              category: s.category,
              operation: s.operation,
              translation: translation ? {
                locale: translation.locale,
                name: translation.name,
                description: translation.description,
              } : undefined,
            }]
          })
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
          responses: { 201: { description: 'Statement added to role' } },
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const addedBy = session.user.id

      const { id, statementId } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('role.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.role?.addStatement, {
        ...ctx,
        resource,
      }, session)

      const role = resource.data as Role

      await ctx.context.adapter.create({
        model: 'roleStatement',
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
          responses: noContent('Statement removed from role'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const removedBy = session.user.id

      const { id, statementId } = ctx.body

      const resource = await findRoleContext(ctx.context.adapter, id)
      if (!resource) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('role.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      await applyEndpointAuth(config?.endpoints?.role?.removeStatement, {
        ...ctx,
        resource,
      }, session)

      const role = resource.data as Role

      await ctx.context.adapter.delete({
        model: 'roleStatement',
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
