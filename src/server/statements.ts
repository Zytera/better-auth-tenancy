import { z } from 'zod'
import { createAuthEndpoint, APIError, getSessionFromCtx } from 'better-auth/api'
import type { Statement, StatementTranslation } from '../schema'
import type { StatementId } from '../types/statement'
import type { TenancyConfig } from '../types/config'
import { validateStatementId } from '../types/statement'
import { getLocaleFromHeaders, getBestLocale } from '../utils/locale-helper'
import { applyEndpointAuth, requireSession } from './middleware'

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
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.statement?.create, ctx, session)

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

      const translations = await ctx.context.adapter.findMany({
        model: 'statementTranslation',
        where: [{ field: 'statementId', value: statement.id }],
      }) as StatementTranslation[]

      if (translations.length === 0) {
        return ctx.json(statement)
      }

      const acceptLanguage = getLocaleFromHeaders(ctx.headers)
      const availableLocales = translations.map((t) => t.locale)
      const bestLocale = getBestLocale(acceptLanguage, availableLocales, config)

      const translation = bestLocale
        ? translations.find((t) => t.locale === bestLocale)
        : translations[0]

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
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.statement?.update, ctx, session)

      const { id, category, operation } = ctx.body

      const current = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null
      if (!current) throw new APIError('NOT_FOUND', { message: 'Statement not found' })

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
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.statement?.delete, ctx, session)

      const { id } = ctx.body

      const statement = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: id }],
      }) as Statement | null
      if (!statement) throw new APIError('NOT_FOUND', { message: 'Statement not found' })

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
        limit: z.coerce.number().min(1).max(100).optional(),
        offset: z.coerce.number().min(0).optional(),
      }),
      metadata: {
        openapi: {
          summary: 'List statements',
          description: 'List all statements with pagination and localized translations based on Accept-Language header',
        },
      },
    },
    async (ctx) => {
      const session = await getSessionFromCtx(ctx)
      await applyEndpointAuth(config?.endpoints?.statement?.list, ctx, session)

      const { limit = 50, offset = 0 } = ctx.query

      let items = await ctx.context.adapter.findMany({
        model: 'statement',
      }) as Statement[]

      const total = items.length

      const acceptLanguage = getLocaleFromHeaders(ctx.headers)

      const allTranslations = await ctx.context.adapter.findMany({
        model: 'statementTranslation',
      }) as StatementTranslation[]

      const translationsByStatement = new Map<string, StatementTranslation[]>()
      for (const translation of allTranslations) {
        const existing = translationsByStatement.get(translation.statementId) || []
        existing.push(translation)
        translationsByStatement.set(translation.statementId, existing)
      }

      items = items.slice(offset, offset + limit)

      const itemsWithTranslations = items.map((statement) => {
        const translations = translationsByStatement.get(statement.id) || []
        if (translations.length === 0) return statement

        const availableLocales = translations.map((t) => t.locale)
        const bestLocale = getBestLocale(acceptLanguage, availableLocales, config)

        const translation = bestLocale
          ? translations.find((t) => t.locale === bestLocale)
          : translations[0]

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
        },
      },
    },
    async (ctx) => {
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      await applyEndpointAuth(config?.endpoints?.statement?.batchCreate, ctx, session)

      const { statements } = ctx.body
      const successful: Statement[] = []
      const failed: Array<{ id: StatementId; error: string }> = []

      for (const id of statements) {
        try {
          const validation = validateStatementId(id)
          if (!validation.isValid) {
            failed.push({ id, error: validation.error || 'Invalid statement ID' })
            continue
          }

          const existing = await ctx.context.adapter.findOne({
            model: 'statement',
            where: [{ field: 'id', value: id }],
          }) as Statement | null
          if (existing) {
            failed.push({ id, error: `Statement "${id}" already exists` })
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

