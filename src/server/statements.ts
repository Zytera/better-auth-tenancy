import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Statement, StatementTranslation } from '../schema/index.js'
import type { StatementId } from '../types/statement.js'
import type { TenancyConfig } from '../types/index.js'
import { validateStatementId } from '../types/statement.js'
import { getLocaleFromHeaders } from '../utils/locale-helper.js'
import { applyEndpointAuth, requireEndpointAuth, requireSession } from './middleware.js'
import { getErrorMessage } from '../utils/error-messages.js'
import { ok, created, noContent, okList, okBatch, statementSchema, statementWithTranslationSchema } from './openapi.js'

export interface CreateStatementInput {
  id: StatementId
}

export const statementEndpoints = (config?: TenancyConfig) => ({
  createStatement: createAuthEndpoint(
    '/tenancy/statement/create',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Create statement',
          description: 'Create a new permission statement (requires authentication)',
          responses: created(statementSchema, 'Statement created'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await requireEndpointAuth(config?.endpoints?.statement?.create, ctx, session)

      const { id } = ctx.body

      const validation = validateStatementId(id)
      if (!validation.isValid) {
        throw new APIError('BAD_REQUEST', { message: validation.error })
      }

      const existing = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null
      if (existing) {
        throw new APIError('BAD_REQUEST', { message: `Statement "${id}" already exists` })
      }

      const parsed = validation.parsed!
      const statement = await ctx.context.adapter.create({
        model: 'statement',
        data: {
          id,
          category: parsed.category,
          operation: parsed.operation,
        },
      }) as Statement

      if (config?.audit?.onEntityCreated) {
        await config.audit.onEntityCreated({
          entityType: 'statement',
          entityId: statement.id,
          createdBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(statement, { status: 201 })
    }
  ),

  getStatement: createAuthEndpoint(
    '/tenancy/statement/:id',
    {
      method: 'GET',
      params: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Get statement',
          description: 'Get statement by ID with localized translation based on Accept-Language header',
          responses: ok(statementWithTranslationSchema, 'The statement with localized translation'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.statement?.read, ctx, session)

      const { id } = ctx.params

      const statement = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null

      if (!statement) throw new APIError('NOT_FOUND', { message: 'Statement not found' })

      // Fetch only the needed translation
      const acceptLanguage = getLocaleFromHeaders(ctx.headers)
      // Extract ISO alpha-2 code (first 2 chars) to match DB format
      const preferredLocale = acceptLanguage ? acceptLanguage.substring(0, 2).toLowerCase() : 'en'

      // Try to fetch translation in the preferred locale
      let translations = await ctx.context.adapter.findMany({
        model: 'statementTranslation',
        where: [
          { field: 'statementId', value: statement.id },
          { field: 'locale', value: preferredLocale }
        ],
      }) as StatementTranslation[]

      // If no translation found and preferred locale is not 'en', fallback to English
      if (translations.length === 0 && preferredLocale !== 'en') {
        translations = await ctx.context.adapter.findMany({
          model: 'statementTranslation',
          where: [
            { field: 'statementId', value: statement.id },
            { field: 'locale', value: 'en' }
          ],
        }) as StatementTranslation[]
      }

      const translation = translations[0]

      return ctx.json({
        ...statement,
        translation: translation
          ? {
              locale: translation.locale,
              name: translation.name,
              description: translation.description,
            }
          : undefined,
      })
    }
  ),

  updateStatement: createAuthEndpoint(
    '/tenancy/statement/update',
    {
      method: 'POST',
      body: z.object({
        id: z.string(),
        category: z.string().optional(),
        operation: z.string().optional(),
      }),
      metadata: {
        openapi: {
          summary: 'Update statement',
          description: 'Update an existing statement (requires authentication)',
          responses: ok(statementSchema, 'Updated statement'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      await requireEndpointAuth(config?.endpoints?.statement?.update, ctx, session)

      const { id, category, operation } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null
      if (!current) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('statement.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      const changes: Record<string, { old: unknown; new: unknown }> = {}
      if (category && category !== current.category) {
        changes.category = { old: current.category, new: category }
      }
      if (operation && operation !== current.operation) {
        changes.operation = { old: current.operation, new: operation }
      }

      const updated = await ctx.context.adapter.update({
        model: 'statement',
        where: [{ field: 'id', value: id }],
        update: { category, operation },
      }) as Statement

      if (Object.keys(changes).length > 0 && config?.audit?.onEntityUpdated) {
        await config.audit.onEntityUpdated({
          entityType: 'statement',
          entityId: id,
          changes,
          updatedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(updated)
    }
  ),

  deleteStatement: createAuthEndpoint(
    '/tenancy/statement/delete',
    {
      method: 'POST',
      body: z.object({
        id: z.string()
      }),
      metadata: {
        openapi: {
          summary: 'Delete statement',
          description: 'Delete a statement (requires authentication)',
          responses: noContent('Statement deleted'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      await requireEndpointAuth(config?.endpoints?.statement?.delete, ctx, session)

      const { id } = ctx.body

      const statement = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null
      if (!statement) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('NOT_FOUND', {
          message: getErrorMessage('statement.not_found', locale, undefined, config?.i18n?.errorMessages)
        })
      }

      // Check if statement is used in role statements
      const roleStatementsInUse = await ctx.context.adapter.findMany({
        model: 'roleStatement',
        where: [{ field: 'statementId', value: id }],
      }) as any[]

      const roleStatementsCount = roleStatementsInUse.length
      if (roleStatementsCount > 0) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage(
            'statement.delete.in_use_roles',
            locale,
            { count: roleStatementsCount },
            config?.i18n?.errorMessages
          ),
        })
      }

      // Check if statement is used in permissions
      const [grants, denies] = await Promise.all([
        ctx.context.adapter.findMany({
          model: 'permissionGrant',
          where: [{ field: 'statementId', value: id }],
        }) as Promise<any[]>,
        ctx.context.adapter.findMany({
          model: 'permissionDeny',
          where: [{ field: 'statementId', value: id }],
        }) as Promise<any[]>
      ])

      const permissionsCount = grants.length + denies.length
      if (permissionsCount > 0) {
        const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
        throw new APIError('BAD_REQUEST', {
          message: getErrorMessage(
            'statement.delete.in_use_permissions',
            locale,
            { count: permissionsCount },
            config?.i18n?.errorMessages
          ),
        })
      }

      // Delete statement translations
      await ctx.context.adapter.delete({
        model: 'statementTranslation',
        where: [{ field: 'statementId', value: id }],
      })

      // Delete the statement
      await ctx.context.adapter.delete({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      })

      if (config?.audit?.onEntityDeleted) {
        await config.audit.onEntityDeleted({
          entityType: 'statement',
          entityId: id,
          deletedBy,
          timestamp: new Date(),
        })
      }

      return ctx.json(null, { status: 204 })
    }
  ),

  listStatements: createAuthEndpoint(
    '/tenancy/statement/list',
    {
      method: 'GET',
      query: z.object({
        limit: z.coerce.number().min(1).max(2000).optional(),
        offset: z.coerce.number().min(0).optional(),
        category: z.string().optional(),
        orderBy: z.enum(['createdAt', 'id']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List statements',
          description: 'List all statements with pagination and localized translations based on Accept-Language header. Use category param to filter by category prefixes (comma-separated).',
          responses: okList(statementWithTranslationSchema, 'List of statements with translations'),
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.statement?.list, ctx, session)

      const { limit = 50, offset = 0, category, orderBy, orderDirection } = ctx.query

      let items: Statement[]
      let total: number

      if (category) {
        // Filter by category prefixes using starts_with operator
        const categoryPrefixes = category.split(',').map(prefix => prefix.trim())

        // Build where conditions with OR connector for multiple prefixes
        const where: any[] = categoryPrefixes.flatMap((prefix, _) => {
            return [{ field: 'category', operator: 'starts_with', value: prefix, connector: 'OR' }]
        })

        const [fetchedItems, fetchedTotal] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'statement',
            where,
            limit,
            offset,
            sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
          }) as Promise<Statement[]>,
          ctx.context.adapter.count({
            model: 'statement',
            where,
          })
        ])
        items = fetchedItems
        total = fetchedTotal
      } else {
        // Without filter, use efficient adapter pagination
        const [fetchedItems, fetchedTotal] = await Promise.all([
          ctx.context.adapter.findMany({
            model: 'statement',
            limit,
            offset,
            sortBy: orderBy ? { field: orderBy, direction: orderDirection || 'asc' } : undefined,
          }) as Promise<Statement[]>,
          ctx.context.adapter.count({
            model: 'statement',
          })
        ])

        items = fetchedItems
        total = fetchedTotal
      }

      // Fetch only the needed translations for the items being returned
      const statementIds = items.map(s => s.id)

      let translations: StatementTranslation[] = []
      if (statementIds.length > 0) {
        const preferredLocale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)

        // Try to fetch translations in the preferred locale
        translations = await ctx.context.adapter.findMany({
          model: 'statementTranslation',
          where: [
            { field: 'statementId', operator: 'in', value: statementIds },
            { field: 'locale', value: preferredLocale }
          ],
        }) as StatementTranslation[]

        // If no translations found and preferred locale is not 'en', fallback to English
        if (translations.length === 0 && preferredLocale !== 'en') {
          translations = await ctx.context.adapter.findMany({
            model: 'statementTranslation',
            where: [
              { field: 'statementId', operator: 'in', value: statementIds },
              { field: 'locale', value: 'en' }
            ],
          }) as StatementTranslation[]
        }
      }

      const translationsByStatement = new Map<string, StatementTranslation>()
      for (const translation of translations) {
        translationsByStatement.set(translation.statementId, translation)
      }

      const itemsWithTranslations = items.map((statement) => {
        const translation = translationsByStatement.get(statement.id)

        return {
          ...statement,
          translation: translation
            ? {
                locale: translation.locale,
                name: translation.name,
                description: translation.description,
              }
            : undefined,
        }
      })

      return ctx.json({ items: itemsWithTranslations, total, limit, offset })
    }
  ),

  batchCreateStatements: createAuthEndpoint(
    '/tenancy/statement/batch-create',
    {
      method: 'POST',
      body: z.object({
        statements: z.array(z.string()),
      }),
      metadata: {
        openapi: {
          summary: 'Batch create statements',
          description: 'Create multiple statements at once (requires authentication)',
          responses: okBatch(statementSchema, 'Batch create result'),
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await requireEndpointAuth(config?.endpoints?.statement?.batchCreate, ctx, session)

      const { statements } = ctx.body
      const successful: Statement[] = []
      const failed: Array<{ id: StatementId; error: string }> = []

      for (const id of statements) {
        try {
          const validation = validateStatementId(id)
          if (!validation.isValid) {
            const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
            failed.push({
              id,
              error: getErrorMessage(
                'statement.invalid_id',
                locale,
                { error: validation.error || 'Invalid statement ID' },
                config?.i18n?.errorMessages
              )
            })
            continue
          }

          const existing = await ctx.context.adapter.findOne({
            model: 'statement',
            where: [{ field: 'id', value: id }],
          }) as Statement | null
          if (existing) {
            const locale = getLocaleFromHeaders(ctx.headers, config?.i18n?.defaultLocale)
            failed.push({
              id,
              error: getErrorMessage(
                'statement.already_exists',
                locale,
                { id },
                config?.i18n?.errorMessages
              )
            })
            continue
          }

          const parsed = validation.parsed!
          const statement = await ctx.context.adapter.create({
            model: 'statement',
            data: {
              id,
              category: parsed.category,
              operation: parsed.operation,
            },
          }) as Statement

          if (config?.audit?.onEntityCreated) {
            await config.audit.onEntityCreated({
              entityType: 'statement',
              entityId: statement.id,
              createdBy,
              timestamp: new Date(),
            })
          }

          successful.push(statement)
        } catch (error) {
          failed.push({
            id,
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      return ctx.json({ successful, failed })
    }
  ),
})

