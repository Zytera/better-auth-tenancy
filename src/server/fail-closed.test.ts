import { test, expect } from 'bun:test'
import { APIError } from 'better-auth/api'
import { tenancy } from './plugin'
import { organizationEndpoints } from './organizations'
import { teamEndpoints } from './teams'
import { statementEndpoints } from './statements'
import { roleEndpoints } from './roles'
import { memberEndpoints } from './members'
import { invitationEndpoints } from './invitations'
import { permissionEndpoints } from './permissions'
import type { TenancyConfig } from '../types'

/**
 * Regression tests for the fail-closed authorization default (CWE-862).
 *
 * Contract:
 * - WRITE endpoints (create/update/delete/grant/...): no hook configured ->
 *   403 FORBIDDEN, even for authenticated callers.
 * - READ endpoints: no hook configured -> anonymous callers get 401;
 *   authenticated callers proceed (documented default floor).
 * - Permission oracle (check/grants/denies, #34): session required, and an
 *   authenticated caller may only query itself — third-party queries need
 *   the dedicated hook (permission.check / listGrants / listDenies).
 * - Token-based invitation writes (accept/reject/cleanup): no hook -> 403;
 *   a configured hook keeps the token flow working and receives the session.
 * - revokePermission passes the session to its hook (M8, #36).
 */

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

/**
 * Row covering every field the endpoint handlers and context helpers read:
 * organization/team (parentType/parentId), role/member/invitation
 * (contextType/contextId/userId/roleId/status/expiresAt), permission
 * (statementId/type), statement (category/operation).
 */
function richRow() {
  return {
    id: 'row1',
    name: 'Row',
    slug: 'row',
    parentType: 'organization',
    parentId: 'org1',
    contextType: 'organization',
    contextId: 'org1',
    userId: 'user2',
    roleId: 'role1',
    token: 'tok',
    invitationCode: 'ABCD2345',
    identifier: 'invitee@example.com',
    invitedBy: 'user2',
    invitedByUser: null,
    status: 'pending',
    expiresAt: new Date(Date.now() + 86_400_000),
    statementId: 'team:read',
    category: 'team',
    operation: 'read',
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

/**
 * In-memory adapter that returns a rich row for id/token/code lookups and
 * null for slug/identifier lookups, so pre-auth resource lookups succeed and
 * post-auth flows reach their sinks. Records mutations in `ops`.
 */
function fakeAdapter() {
  const ops: string[] = []
  return {
    ops,
    findOne: async ({ where }: any) => {
      if (where?.some((w: any) => w.field === 'id' || w.field === 'token' || w.field === 'invitationCode')) {
        return richRow()
      }
      return null
    },
    findMany: async () => [],
    count: async () => 0,
    create: async ({ data }: any) => {
      ops.push('create')
      return { ...richRow(), ...data, id: 'new1' }
    },
    update: async ({ update }: any) => {
      ops.push('update')
      return { ...richRow(), ...update }
    },
    delete: async () => {
      ops.push('delete')
    },
  } as any
}

const authedSession = () => ({
  user: { id: 'user1' },
  session: { id: 'sess1', userId: 'user1' },
})

/** Invoke an endpoint handler the way the better-auth router would. */
function call(endpoint: any, input: Record<string, unknown> = {}) {
  return endpoint({
    headers: new Headers(),
    context: { adapter: fakeAdapter(), session: input.anonymous ? undefined : authedSession() },
    ...(input as any),
  })
}

async function expectStatus(promise: Promise<any>, status: string) {
  try {
    await promise
  } catch (error: any) {
    expect(error.status).toBe(status)
    return
  }
  throw new Error(`Expected ${status} but the endpoint call succeeded`)
}

/** Auth passed: the endpoint proceeded past authorization (any outcome). */
async function expectAuthPassed(promise: Promise<any>) {
  try {
    await promise
    return
  } catch (error: any) {
    expect([401, 403]).not.toContain(error.statusCode)
    expect(error.status).not.toBe('UNAUTHORIZED')
    expect(error.status).not.toBe('FORBIDDEN')
  }
}

const allow = async () => {}
const allowAllConfig: TenancyConfig = {
  endpoints: {
    organization: { create: allow, update: allow, delete: allow, read: allow, list: allow },
    team: { create: allow, update: allow, delete: allow },
    member: { add: allow, remove: allow, updateRole: allow },
    role: { create: allow, update: allow, delete: allow, addStatement: allow, removeStatement: allow },
    statement: { create: allow, update: allow, delete: allow, batchCreate: allow },
    permission: { grant: allow, deny: allow, revoke: allow, grantBatch: allow, denyBatch: allow },
    invitation: { create: allow, accept: allow, decline: allow, revoke: allow, cleanupExpired: allow },
  },
}

// Endpoint groups without hooks (fail-closed defaults) and with allow-all
// hooks (configured authorization) — both built once.
const noHooks = {
  org: organizationEndpoints(undefined),
  team: teamEndpoints(undefined),
  member: memberEndpoints(undefined),
  role: roleEndpoints(undefined),
  statement: statementEndpoints(undefined),
  permission: permissionEndpoints(undefined),
  invitation: invitationEndpoints(undefined),
}
const allAllowed = {
  org: organizationEndpoints(allowAllConfig),
  invitation: invitationEndpoints(allowAllConfig),
  permission: permissionEndpoints(allowAllConfig),
}

// ---------------------------------------------------------------------------
// Write endpoints: no hook configured -> 403 FORBIDDEN (even authenticated)
// ---------------------------------------------------------------------------

const writeCases: Array<[string, () => Promise<any>]> = [
  ['organization/create', () => call(noHooks.org.createOrganization, { body: { name: 'Org', slug: 'org' } })],
  ['organization/update', () => call(noHooks.org.updateOrganization, { body: { id: 'row1', name: 'New' } })],
  ['organization/delete', () => call(noHooks.org.deleteOrganization, { body: { id: 'org1' } })],
  ['team/create', () => call(noHooks.team.createTeam, { body: { parentType: 'organization', parentId: 'org1', name: 'Team', slug: 'team' } })],
  ['team/update', () => call(noHooks.team.updateTeam, { body: { id: 'row1', name: 'New' } })],
  ['team/delete', () => call(noHooks.team.deleteTeam, { body: { id: 'row1' } })],
  ['statement/create', () => call(noHooks.statement.createStatement, { body: { id: 'custom:test' } })],
  ['statement/update', () => call(noHooks.statement.updateStatement, { body: { id: 'custom:test', category: 'custom' } })],
  ['statement/delete', () => call(noHooks.statement.deleteStatement, { body: { id: 'custom:test' } })],
  ['statement/batch-create', () => call(noHooks.statement.batchCreateStatements, { body: { statements: ['a:b', 'c:d'] } })],
  ['role/create', () => call(noHooks.role.createRole, { body: { contextType: 'organization', contextId: 'org1', name: 'Role' } })],
  ['role/update', () => call(noHooks.role.updateRole, { body: { id: 'row1', name: 'New' } })],
  ['role/delete', () => call(noHooks.role.deleteRole, { body: { id: 'row1' } })],
  ['role/statement/add', () => call(noHooks.role.addStatementToRole, { body: { id: 'row1', statementId: 'team:read' } })],
  ['role/translations/set', () => call(noHooks.role.setRoleTranslations, { body: { id: 'row1', translations: [{ locale: 'es', name: 'Rol' }] } })],
  ['role/statement/remove', () => call(noHooks.role.removeStatementFromRole, { body: { id: 'row1', statementId: 'team:read' } })],
  ['member/add', () => call(noHooks.member.addMember, { body: { userId: 'user2', contextType: 'organization', contextId: 'org1' } })],
  ['member/role/update', () => call(noHooks.member.updateMemberRole, { body: { id: 'row1', roleId: 'role2' } })],
  ['member/metadata/update', () => call(noHooks.member.updateMemberMetadata, { body: { id: 'row1', metadata: { k: 'v' } } })],
  ['member/remove', () => call(noHooks.member.removeMember, { body: { id: 'row1' } })],
  ['permission/grant', () => call(noHooks.permission.grantPermission, { body: { userId: 'user2', statementId: 'team:read', contextType: 'organization', contextId: 'org1' } })],
  ['permission/deny', () => call(noHooks.permission.denyPermission, { body: { userId: 'user2', statementId: 'team:read', contextType: 'organization', contextId: 'org1' } })],
  ['permission/revoke', () => call(noHooks.permission.revokePermission, { body: { permissionId: 'row1', type: 'grant' } })],
  ['permission/grant-batch', () => call(noHooks.permission.grantBatch, { body: { grants: [{ userId: 'user2', statementId: 'team:read', contextType: 'organization', contextId: 'org1' }] } })],
  ['permission/deny-batch', () => call(noHooks.permission.denyBatch, { body: { denies: [{ userId: 'user2', statementId: 'team:read', contextType: 'organization', contextId: 'org1' }] } })],
  ['invitation/create', () => call(noHooks.invitation.createInvitation, { body: { contextType: 'organization', contextId: 'org1' } })],
  ['invitation/cancel', () => call(noHooks.invitation.cancelInvitation, { body: { id: 'row1' } })],
  // Token-based writes: hook is mandatory too. Anonymous AND authenticated
  // callers are denied without a configured hook.
  ['invitation/accept', () => call(noHooks.invitation.acceptInvitation, { anonymous: true, body: { token: 'tok' } })],
  ['invitation/reject', () => call(noHooks.invitation.rejectInvitation, { anonymous: true, body: { token: 'tok' } })],
  ['invitation/cleanup-expired', () => call(noHooks.invitation.cleanupExpiredInvitations, { anonymous: true })],
]

for (const [name, run] of writeCases) {
  test(`write fails closed without hook: ${name} -> 403`, async () => {
    await expectStatus(run(), 'FORBIDDEN')
  })
}

test('invitation/accept -> 403 even when authenticated (hook is mandatory, not session)', async () => {
  await expectStatus(
    call(noHooks.invitation.acceptInvitation, { body: { token: 'tok' } }),
    'FORBIDDEN',
  )
})

// ---------------------------------------------------------------------------
// Read endpoints: no hook configured -> anonymous 401, authenticated proceeds
// ---------------------------------------------------------------------------

const readCases: Array<[string, (anonymous: boolean) => Promise<any>]> = [
  ['organization/:id', (anon) => call(noHooks.org.getOrganization, { anonymous: anon, params: { id: 'row1' } })],
  ['organization/by-slug/:slug', (anon) => call(noHooks.org.getOrganizationBySlug, { anonymous: anon, params: { slug: 'row' } })],
  ['organization/list', (anon) => call(noHooks.org.listOrganizations, { anonymous: anon, query: {} })],
  ['team/:id', (anon) => call(noHooks.team.getTeam, { anonymous: anon, params: { id: 'row1' } })],
  ['team/:parentType/:parentId/by-slug/:slug', (anon) => call(noHooks.team.getTeamBySlug, { anonymous: anon, params: { parentType: 'organization', parentId: 'org1', slug: 'team' } })],
  ['team/list', (anon) => call(noHooks.team.listTeamsByParent, { anonymous: anon, query: { parentType: 'organization', parentId: 'org1' } })],
  ['statement/:id', (anon) => call(noHooks.statement.getStatement, { anonymous: anon, params: { id: 'row1' } })],
  ['statement/list', (anon) => call(noHooks.statement.listStatements, { anonymous: anon, query: {} })],
  ['role/:id', (anon) => call(noHooks.role.getRole, { anonymous: anon, params: { id: 'row1' } })],
  ['role/list', (anon) => call(noHooks.role.listRoles, { anonymous: anon, query: { contextType: 'organization', contextId: 'org1' } })],
  ['member/:id', (anon) => call(noHooks.member.getMember, { anonymous: anon, params: { id: 'row1' } })],
  ['member/list', (anon) => call(noHooks.member.listMembers, { anonymous: anon, query: { contextType: 'organization', contextId: 'org1' } })],
  ['invitation/list', (anon) => call(noHooks.invitation.listInvitations, { anonymous: anon, query: { contextType: 'organization', contextId: 'org1' } })],
  ['invitation/by-token/:token', (anon) => call(noHooks.invitation.getInvitationByToken, { anonymous: anon, params: { token: 'tok' } })],
  ['invitation/by-code/:code', (anon) => call(noHooks.invitation.getInvitationByCode, { anonymous: anon, params: { code: 'ABCD2345' } })],
]

for (const [name, run] of readCases) {
  test(`read without hook: ${name} -> 401 for anonymous callers`, async () => {
    await expectStatus(run(true), 'UNAUTHORIZED')
  })
}

for (const [name, run] of readCases) {
  test(`read without hook: ${name} -> authenticated callers pass authorization`, async () => {
    await expectAuthPassed(run(false))
  })
}

// ---------------------------------------------------------------------------
// #30: invitation codes are CSPRNG-generated over a 40-bit keyspace
// (8 chars from A-H J-N P-Z 2-9). The validator enforces the new format at
// every code-entry point, so legacy 6-character codes fail fast with
// BAD_REQUEST instead of reaching an adapter lookup.
// ---------------------------------------------------------------------------

test('invitation/by-code rejects legacy 6-character codes with BAD_REQUEST (#30)', async () => {
  await expectStatus(
    call(allAllowed.invitation.getInvitationByCode, { params: { code: 'ABC123' } }),
    'BAD_REQUEST',
  )
})

test('invitation/reject by code validates the format too: legacy 6-char code -> BAD_REQUEST (4.1.0 review)', async () => {
  await expectStatus(
    call(allAllowed.invitation.rejectInvitation, { anonymous: true, body: { invitationCode: 'ABC123' } }),
    'BAD_REQUEST',
  )
})

test('invitation/accept by new-format code with configured no-op hook: proceeds', async () => {
  const adapter = { ...fakeAdapter() }
  const response = await allAllowed.invitation.acceptInvitation({
    headers: new Headers(),
    context: { adapter },
    body: { invitationCode: 'ABCD2345' },
  })
  const data = await response
  expect(data.invitation.status).toBe('accepted')
  expect(adapter.ops).toContain('update')
})

// ---------------------------------------------------------------------------
// #34: permission oracle (check/grants/denies) — session + self-or-hook
//
// Unlike generic read endpoints, these expose per-user authorization state
// (allowed, reason, details.source, grantedBy, expiresAt), so an
// authenticated caller may only query itself. Third-party queries fail
// closed (403) unless the consumer configures the dedicated hook.
// ---------------------------------------------------------------------------

const oracleBody = { userId: 'user1', statementId: 'team:read', contextType: 'organization', contextId: 'org1' }

test('permission oracle: anonymous callers get 401 (check/grants/denies)', async () => {
  await expectStatus(call(noHooks.permission.checkPermission, { anonymous: true, body: oracleBody }), 'UNAUTHORIZED')
  await expectStatus(call(noHooks.permission.listGrants, { anonymous: true, query: { userId: 'user1' } }), 'UNAUTHORIZED')
  await expectStatus(call(noHooks.permission.listDenies, { anonymous: true, query: { userId: 'user1' } }), 'UNAUTHORIZED')
})

test('permission oracle: anonymous callers get 401 even with hooks configured (4.1.0 review)', async () => {
  const endpoints = permissionEndpoints({
    endpoints: { permission: { check: allow, listGrants: allow, listDenies: allow } },
  })
  await expectStatus(call(endpoints.checkPermission, { anonymous: true, body: oracleBody }), 'UNAUTHORIZED')
  await expectStatus(call(endpoints.listGrants, { anonymous: true, query: { userId: 'user1' } }), 'UNAUTHORIZED')
  await expectStatus(call(endpoints.listDenies, { anonymous: true, query: { userId: 'user1' } }), 'UNAUTHORIZED')
})

test('permission oracle: authenticated callers may query themselves without a hook', async () => {
  const check = await call(noHooks.permission.checkPermission, { body: oracleBody })
  // Empty adapter: authorization passed and the resolver ran to "no permission"
  expect(check.allowed).toBe(false)
  expect(check.reason).toBe('No permission found')
  expect(await call(noHooks.permission.listGrants, { query: { userId: 'user1' } })).toEqual([])
  expect(await call(noHooks.permission.listDenies, { query: { userId: 'user1' } })).toEqual([])
})

test('permission oracle: third-party queries fail closed without a hook (403)', async () => {
  await expectStatus(call(noHooks.permission.checkPermission, { body: { ...oracleBody, userId: 'user2' } }), 'FORBIDDEN')
  await expectStatus(call(noHooks.permission.listGrants, { query: { userId: 'user2' } }), 'FORBIDDEN')
  await expectStatus(call(noHooks.permission.listDenies, { query: { userId: 'user2' } }), 'FORBIDDEN')
})

test('permission oracle: third-party queries with an allowing hook proceed, hook receives the caller session', async () => {
  let seenSessionUserId: string | undefined = 'never-called'
  const config: TenancyConfig = {
    endpoints: {
      permission: {
        check: async ({ session }) => { seenSessionUserId = session?.user?.id },
        listGrants: allow,
        listDenies: allow,
      },
    },
  }
  const endpoints = permissionEndpoints(config)
  const check = await call(endpoints.checkPermission, { body: { ...oracleBody, userId: 'user2' } })
  expect(check.allowed).toBe(false)
  expect(seenSessionUserId).toBe('user1')
  expect(await call(endpoints.listGrants, { query: { userId: 'user2' } })).toEqual([])
  expect(await call(endpoints.listDenies, { query: { userId: 'user2' } })).toEqual([])
})

test('permission oracle: third-party queries with a denying hook get the hook decision (403)', async () => {
  const deny = async () => { throw new APIError('FORBIDDEN', { message: 'denied' }) }
  const endpoints = permissionEndpoints({
    endpoints: { permission: { check: deny, listGrants: deny, listDenies: deny } },
  })
  await expectStatus(call(endpoints.checkPermission, { body: { ...oracleBody, userId: 'user2' } }), 'FORBIDDEN')
  await expectStatus(call(endpoints.listGrants, { query: { userId: 'user2' } }), 'FORBIDDEN')
  await expectStatus(call(endpoints.listDenies, { query: { userId: 'user2' } }), 'FORBIDDEN')
})

// y-tu-que-compras scenario: organization/list has no hook but consumers
// filter via permissionFiltering; a valid session must still be enough.
test('organization/list with a valid session and no hook -> 200', async () => {
  const response = await call(noHooks.org.listOrganizations, { query: {} })
  const data = await response
  expect(data.items).toEqual([])
})

// ---------------------------------------------------------------------------
// Token-based flows survive when the consumer configures a (no-op) hook
// ---------------------------------------------------------------------------

test('invitation/accept with configured no-op hook: anonymous invitee proceeds (SMS funnel)', async () => {
  const adapter = { ...fakeAdapter() }
  const response = await allAllowed.invitation.acceptInvitation({
    headers: new Headers(),
    context: { adapter }, // no session: pre-account invitee
    body: { token: 'tok' },
  })
  const data = await response
  expect(data.invitation.status).toBe('accepted')
  expect(adapter.ops).toContain('update')
})

test('invitation/accept hook receives the optional session (null when anonymous)', async () => {
  let received: any = 'never-called'
  const config: TenancyConfig = {
    endpoints: {
      invitation: {
        accept: async (authCtx) => { received = authCtx.session },
      },
    },
  }
  await invitationEndpoints(config).acceptInvitation({
    headers: new Headers(),
    context: { adapter: fakeAdapter() },
    body: { token: 'tok' },
  })
  expect(received).toBeNull()
})

test('invitation/accept hook receives the caller session when authenticated', async () => {
  let received: any = 'never-called'
  const config: TenancyConfig = {
    endpoints: {
      invitation: {
        accept: async (authCtx) => { received = authCtx.session },
      },
    },
  }
  await invitationEndpoints(config).acceptInvitation({
    headers: new Headers(),
    context: { adapter: fakeAdapter(), session: authedSession() },
    body: { token: 'tok' },
  })
  expect(received?.user?.id).toBe('user1')
})

test('invitation/reject with configured no-op hook: anonymous caller proceeds', async () => {
  const response = await allAllowed.invitation.rejectInvitation({
    headers: new Headers(),
    context: { adapter: fakeAdapter() },
    body: { token: 'tok' },
  })
  const data = await response
  expect(data.status).toBe('rejected')
})

test('invitation/cleanup-expired with configured no-op hook: proceeds (cron)', async () => {
  const response = await allAllowed.invitation.cleanupExpiredInvitations({
    headers: new Headers(),
    context: { adapter: fakeAdapter() },
  })
  const data = await response
  expect(data.expiredCount).toBe(0)
})

test('invitation/by-token with configured no-op hook: anonymous lookup proceeds', async () => {
  const response = await invitationEndpoints({
    endpoints: { invitation: { getByToken: allow } },
  }).getInvitationByToken({
    headers: new Headers(),
    context: { adapter: fakeAdapter() },
    params: { token: 'tok' },
  })
  const data = await response
  expect(data.status).toBe('pending')
  expect(data.invitationCode).toBe('ABCD2345')
})

test('organization/list anonymous callers get 401 even with permissionFiltering configured', async () => {
  const config: TenancyConfig = {
    permissionFiltering: {
      filterOrganizations: async (_ctx, orgs) => orgs,
    },
  }
  await expectStatus(
    organizationEndpoints(config).listOrganizations({
      headers: new Headers(),
      context: { adapter: fakeAdapter() }, // anonymous: no session
      query: {},
    }),
    'UNAUTHORIZED',
  )
})

// ---------------------------------------------------------------------------
// M8 (#36): revokePermission passes the session to its hook.
//
// The issue's two impact modes, covered end-to-end:
// - an identity-authorizing hook must see the caller identity and allow the
//   revoke (with the bug it received null -> TypeError -> 500, accidentally
//   DoSing the whole revocation feature);
// - the same hook must deny a mismatched caller (a hook that treats null as
//   "no identity required" would silently authorize revoking anyone's
//   permissions — CWE-863).
// ---------------------------------------------------------------------------

test('revokePermission passes session and resource to the hook (M8)', async () => {
  let seen: any = 'never-called'
  const config: TenancyConfig = {
    endpoints: {
      permission: {
        revoke: async (authCtx) => { seen = authCtx },
      },
    },
  }
  const response = await permissionEndpoints(config).revokePermission({
    headers: new Headers(),
    context: { adapter: fakeAdapter(), session: authedSession() },
    body: { permissionId: 'row1', type: 'grant' },
  })
  await response
  expect(seen.session?.user?.id).toBe('user1')
  expect(seen.ctx.resource?.contextType).toBe('organization')
})

test('revokePermission: identity-authorizing hook sees the caller and allows the revoke (#36)', async () => {
  const identityHook = async ({ session }) => {
    if (session?.user?.id !== 'user1') {
      throw new APIError('FORBIDDEN', { message: 'revocation restricted to user1' })
    }
  }
  const adapter = fakeAdapter()
  const response = await permissionEndpoints({
    endpoints: { permission: { revoke: identityHook } },
  }).revokePermission({
    headers: new Headers(),
    context: { adapter, session: authedSession() },
    body: { permissionId: 'row1', type: 'grant' },
  })
  await response
  expect(adapter.ops).toContain('delete')
})

test('revokePermission: identity-authorizing hook denies a mismatched caller (#36)', async () => {
  const identityHook = async ({ session }) => {
    if (session?.user?.id !== 'admin9') {
      throw new APIError('FORBIDDEN', { message: 'revocation restricted to admin9' })
    }
  }
  await expectStatus(
    permissionEndpoints({
      endpoints: { permission: { revoke: identityHook } },
    }).revokePermission({
      headers: new Headers(),
      context: { adapter: fakeAdapter(), session: authedSession() },
      body: { permissionId: 'row1', type: 'grant' },
    }),
    'FORBIDDEN',
  )
})

// ---------------------------------------------------------------------------
// Configured hooks keep authorizing writes (spot checks)
// ---------------------------------------------------------------------------

test('organization/create with configured hook -> 201 and row created', async () => {
  const adapter = fakeAdapter()
  const response = await allAllowed.org.createOrganization({
    headers: new Headers(),
    context: { adapter, session: authedSession() },
    body: { name: 'Org', slug: 'org' },
  })
  await response
  expect(adapter.ops).toContain('create')
})

test('organization/delete with configured hook -> deletes (cascade runs)', async () => {
  const adapter = fakeAdapter()
  const response = await allAllowed.org.deleteOrganization({
    headers: new Headers(),
    context: { adapter, session: authedSession() },
    body: { id: 'org1' },
  })
  await response
  expect(adapter.ops.filter((op) => op === 'delete').length).toBeGreaterThan(0)
})

// ---------------------------------------------------------------------------
// Runtime warning when no endpoint hooks are configured
// ---------------------------------------------------------------------------

test('tenancy() warns at startup when no endpoint hooks are configured', () => {
  const original = console.warn
  let warned = ''
  console.warn = (msg: any) => { warned = String(msg) }
  try {
    tenancy({})
    expect(warned).toContain('config.endpoints')
    expect(warned).toContain('fails closed')
  } finally {
    console.warn = original
  }
})

test('tenancy() warns when config is omitted entirely', () => {
  const original = console.warn
  let warned = ''
  console.warn = (msg: any) => { warned = String(msg) }
  try {
    tenancy()
    expect(warned).toContain('config.endpoints')
  } finally {
    console.warn = original
  }
})

test('tenancy() does not warn when endpoint hooks are configured', () => {
  const original = console.warn
  let warned = ''
  console.warn = (msg: any) => { warned = String(msg) }
  try {
    tenancy(allowAllConfig)
    expect(warned).toBe('')
  } finally {
    console.warn = original
  }
})
