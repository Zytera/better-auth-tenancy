/**
 * Reusable OpenAPI schema fragments and response builders for the tenancy
 * plugin endpoints. Kept in one place so the documented response shapes stay in
 * sync with what the endpoints actually return.
 *
 * These are plain OpenAPI 3 Schema/Response objects consumed by Better Auth's
 * OpenAPI generator via each endpoint's `metadata.openapi.responses`.
 */

const dateTime = { type: 'string', format: 'date-time' } as const
const nullableDateTime = { type: 'string', format: 'date-time', nullable: true } as const
const metadata = { type: 'object', additionalProperties: true, nullable: true } as const
const contextType = { type: 'string', enum: ['organization', 'team'] } as const

/** Minimal user projection embedded in enriched responses ({ id, name, image }). */
const userLite = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    image: { type: 'string', nullable: true },
  },
  required: ['id', 'name'],
} as const

/** Minimal role projection embedded in enriched responses ({ id, name, description }). */
const roleLite = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
  },
  required: ['id', 'name'],
} as const

// ---------------------------------------------------------------------------
// Model schemas
// ---------------------------------------------------------------------------

export const organizationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    metadata,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  required: ['id', 'name', 'slug', 'createdAt', 'updatedAt'],
} as const

export const teamSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    parentType: contextType,
    parentId: { type: 'string' },
    name: { type: 'string' },
    slug: { type: 'string' },
    metadata,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  required: ['id', 'parentType', 'parentId', 'name', 'slug', 'createdAt', 'updatedAt'],
} as const

const translationLite = {
  type: 'object',
  nullable: true,
  properties: {
    locale: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
  },
  required: ['locale', 'name'],
} as const

export const statementSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'Format: "category:operation"' },
    category: { type: 'string' },
    operation: { type: 'string' },
    createdAt: dateTime,
  },
  required: ['id', 'category', 'operation', 'createdAt'],
} as const

/** Statement enriched with a single resolved translation for the request locale. */
export const statementWithTranslationSchema = {
  type: 'object',
  properties: {
    ...statementSchema.properties,
    translation: translationLite,
  },
  required: statementSchema.required,
} as const

export const roleSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    contextType,
    contextId: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string', nullable: true },
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  required: ['id', 'contextType', 'contextId', 'name', 'createdAt', 'updatedAt'],
} as const

/** Statement projection embedded inside a role ({ id, category, operation, translation? }). */
const roleStatementLite = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    category: { type: 'string' },
    operation: { type: 'string' },
    translation: translationLite,
  },
  required: ['id', 'category', 'operation'],
} as const

export const roleWithStatementsSchema = {
  type: 'object',
  properties: {
    ...roleSchema.properties,
    statements: { type: 'array', items: roleStatementLite },
    statementCount: { type: 'integer' },
  },
  required: [...roleSchema.required, 'statements', 'statementCount'],
} as const

/**
 * List-roles item: statements/statementCount are only present when the request
 * passes includeStatements=true, so they are documented as optional here.
 */
export const roleListItemSchema = {
  type: 'object',
  properties: roleWithStatementsSchema.properties,
  required: roleSchema.required,
} as const

/** Raw member row as stored (returned unenriched by getUserMemberships). */
export const memberSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    contextType,
    contextId: { type: 'string' },
    userId: { type: 'string' },
    roleId: { type: 'string', nullable: true },
    metadata,
    createdAt: dateTime,
    updatedAt: dateTime,
  },
  required: ['id', 'contextType', 'contextId', 'userId', 'createdAt', 'updatedAt'],
} as const

/** Member enriched with embedded user/role projections (userId/roleId omitted). */
export const memberEnrichedSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    contextType,
    contextId: { type: 'string' },
    metadata,
    createdAt: dateTime,
    updatedAt: dateTime,
    user: userLite,
    role: roleLite,
  },
  required: ['id', 'contextType', 'contextId', 'createdAt', 'updatedAt', 'user', 'role'],
} as const

export const permissionGrantSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    statementId: { type: 'string' },
    contextType,
    contextId: { type: 'string' },
    expiresAt: nullableDateTime,
    grantedBy: { type: 'string' },
    createdAt: dateTime,
  },
  required: ['id', 'userId', 'statementId', 'contextType', 'contextId', 'grantedBy', 'createdAt'],
} as const

export const permissionDenySchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    userId: { type: 'string' },
    statementId: { type: 'string' },
    contextType,
    contextId: { type: 'string' },
    deniedBy: { type: 'string' },
    createdAt: dateTime,
  },
  required: ['id', 'userId', 'statementId', 'contextType', 'contextId', 'deniedBy', 'createdAt'],
} as const

/** Invitation enriched for responses (token/invitedBy/roleId stripped, user/role embedded). */
export const invitationEnrichedSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    invitationCode: { type: 'string', nullable: true },
    identifier: { type: 'string', nullable: true },
    contextType,
    contextId: { type: 'string' },
    status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'] },
    expiresAt: nullableDateTime,
    createdAt: dateTime,
    acceptedAt: nullableDateTime,
    cancelledAt: nullableDateTime,
    metadata,
    invitedByUser: userLite,
    role: roleLite,
  },
  required: ['id', 'contextType', 'contextId', 'status', 'createdAt', 'invitedByUser', 'role'],
} as const

export const permissionCheckSchema = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    reason: { type: 'string' },
    details: {
      type: 'object',
      properties: {
        source: { type: 'string', enum: ['deny', 'grant', 'role', 'none'] },
        roleId: { type: 'string' },
        expired: { type: 'boolean' },
      },
      required: ['source'],
    },
  },
  required: ['allowed', 'reason', 'details'],
} as const

export const permissionContextSchema = {
  type: 'object',
  properties: {
    contextType,
    contextId: { type: 'string' },
    name: { type: 'string' },
    parentType: { ...contextType, nullable: true },
    parentId: { type: 'string', nullable: true },
    organizationId: {
      type: 'string',
      description: 'Root organization of this context: the context itself if it is an organization, otherwise the organization at the top of its parent chain.',
    },
    source: {
      type: 'string',
      enum: ['role', 'membership', 'grant', 'inherited'],
      description: 'role = member with an assigned role; membership = member without a role; grant = explicit grant; inherited = access resolved from a parent context',
    },
    roleId: { type: 'string' },
  },
  required: ['contextType', 'contextId', 'name', 'parentType', 'parentId', 'organizationId', 'source'],
} as const

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

const jsonBody = (schema: object) => ({ content: { 'application/json': { schema } } })

/** 200 OK with a JSON body of the given schema. */
export const ok = (schema: object, description = 'Successful response') => ({
  200: { description, ...jsonBody(schema) },
})

/** 201 Created with a JSON body of the given schema. */
export const created = (schema: object, description = 'Created') => ({
  201: { description, ...jsonBody(schema) },
})

/** 204 No Content (no response body). */
export const noContent = (description = 'No Content') => ({
  204: { description },
})

/** 200 OK with an array body of the given item schema. */
export const okArray = (item: object, description = 'Successful response') =>
  ok({ type: 'array', items: item }, description)

/**
 * 200 OK for a paginated list. `total` is always present; `limit`/`offset` are
 * present unless permission filtering collapsed the pagination.
 */
export const okList = (item: object, description = 'Paginated list') =>
  ok(
    {
      type: 'object',
      properties: {
        items: { type: 'array', items: item },
        total: { type: 'integer' },
        limit: { type: 'integer' },
        offset: { type: 'integer' },
      },
      required: ['items', 'total'],
    },
    description,
  )

/** 200 OK for a batch operation split into successful items and failures. */
export const okBatch = (item: object, description = 'Batch result') =>
  ok(
    {
      type: 'object',
      properties: {
        successful: { type: 'array', items: item },
        failed: {
          type: 'array',
          items: {
            type: 'object',
            properties: { input: {}, error: { type: 'string' } },
            required: ['error'],
          },
        },
      },
      required: ['successful', 'failed'],
    },
    description,
  )