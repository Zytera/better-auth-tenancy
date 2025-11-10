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
  // Note: createdBy is automatically obtained from authenticated session
}

export const statementEndpoints = (config?: TenancyConfig) => ({
  createStatement: createAuthEndpoint(
    '/statement/create',
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
      // Require authentication
      const session = await requireSession(ctx)
      const createdBy = session.user.id

      // Apply authorization hook if configured
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
    '/statement/:id',
    {
      method: 'GET',
      params: z.object({ id: z.string() }),
      metadata: {
        openapi: {
          summary: 'Get statement',
          description: 'Get statement by ID with localized translation based on Accept-Language header',
        },
      },
    },
    async (ctx) => {
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.statement?.read, ctx, session)

      const statement = await ctx.context.adapter.findOne({
        model: 'statement',
        where: [{ field: 'id', value: ctx.params.id }],
      }) as Statement | null

      if (!statement) throw new APIError('NOT_FOUND', { message: 'Statement not found' })

      // Get all translations for this statement
      const translations = await ctx.context.adapter.findMany({
        model: 'statementTranslation',
        where: [{ field: 'statementId', value: statement.id }],
      }) as StatementTranslation[]

      // If no translations, return statement as-is
      if (translations.length === 0) {
        return ctx.json(statement)
      }

      // Get Accept-Language from headers
      const acceptLanguage = getLocaleFromHeaders(ctx.headers)
      const availableLocales = translations.map((t) => t.locale)
      const bestLocale = getBestLocale(acceptLanguage, availableLocales, config)

      // Find the best translation
      const translation = bestLocale
        ? translations.find((t) => t.locale === bestLocale)
        : translations[0]

      // Return statement with selected translation
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
    '/statement/:id',
    {
      method: 'PATCH',
      params: z.object({ id: z.string() }),
      body: z.object({
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
      // Require authentication
      const session = await requireSession(ctx)
      const updatedBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.statement?.update, ctx, session)

      const { id } = ctx.params
      const { category, operation } = ctx.body

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
    '/statement/:id',
    {
      method: 'DELETE',
      params: z.object({ id: z.string() }),
      
      metadata: {
        openapi: {
          summary: 'Delete statement',
          description: 'Delete a statement (requires authentication)',
        },
      },
    },
    async (ctx) => {
      // Require authentication
      const session = await requireSession(ctx)
      const deletedBy = session.user.id

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.statement?.delete, ctx, session)

      const { id } = ctx.params

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
    '/statement/list',
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
      // Get session (may be null)
      const session = await getSessionFromCtx(ctx)

      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.statement?.list, ctx, session)

      const { limit = 50, offset = 0 } = ctx.query

      // Get all items first
      let items = await ctx.context.adapter.findMany({
        model: 'statement',
      }) as Statement[]

      const total = items.length

      // Get Accept-Language from headers
      const acceptLanguage = getLocaleFromHeaders(ctx.headers)

      // Get all translations for all statements
      const allTranslations = await ctx.context.adapter.findMany({
        model: 'statementTranslation',
      }) as StatementTranslation[]

      // Map translations by statement ID
      const translationsByStatement = new Map<string, StatementTranslation[]>()
      for (const translation of allTranslations) {
        const existing = translationsByStatement.get(translation.statementId) || []
        existing.push(translation)
        translationsByStatement.set(translation.statementId, existing)
      }

      // Apply pagination
      items = items.slice(offset, offset + limit)

      // Add best translation to each statement
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
    '/statement/batch-create',
    {
      method: 'POST',
      body: z.object({
        statements: z.array(z.string()),
        createdBy: z.string(),
      }),
      metadata: {
        openapi: {
          summary: 'Batch create statements',
          description: 'Create multiple statements at once',
        },
      },
    },
    async (ctx) => {
      // Apply authorization hook if configured
      await applyEndpointAuth(config?.endpoints?.statement?.batchCreate, ctx)

      const { statements, createdBy } = ctx.body
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

