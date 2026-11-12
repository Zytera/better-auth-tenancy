/**
 * Packed-package smoke test.
 *
 * Runs inside a clean consumer project that installed the published tarball.
 * Asserts that every public entrypoint (`.`, `/server`, `/client`) loads from
 * Node ESM and exposes the documented API surface. This is the regression
 * guard for dist/exports breakage (e.g. plugins erased from type resolution,
 * dist not loadable from Node ESM).
 */
import assert from 'node:assert/strict'
import * as root from '@zytera/better-auth-tenancy'
import * as server from '@zytera/better-auth-tenancy/server'
import * as client from '@zytera/better-auth-tenancy/client'

// --- Root export: shared schemas and utilities -----------------------------

assert.equal(typeof root.parseStatementId, 'function', 'root: parseStatementId must be exported')
assert.deepEqual(root.parseStatementId('team:read'), { id: 'team:read', category: 'team', operation: 'read' })
assert.equal(typeof root.buildStatementId, 'function', 'root: buildStatementId must be exported')
assert.equal(root.buildStatementId('team', 'read'), 'team:read')
assert.equal(typeof root.validateStatementId, 'function', 'root: validateStatementId must be exported')
assert.equal(root.validateStatementId('team:read').isValid, true)

assert.equal(typeof root.generateInvitationCode, 'function', 'root: generateInvitationCode must be exported')
assert.match(root.generateInvitationCode(), /^[A-Z]{3}[0-9]{3}$/)
assert.equal(typeof root.generateInvitationLink, 'function', 'root: generateInvitationLink must be exported')
assert.equal(
  root.generateInvitationLink('https://app.example.com', 'tok123'),
  'https://app.example.com/join?token=tok123'
)
assert.equal(typeof root.canUseInvitation, 'function', 'root: canUseInvitation must be exported')
assert.deepEqual(root.canUseInvitation({ status: 'pending', expiresAt: null }), { canUse: true })

assert.ok(Array.isArray(root.allSchemas) && root.allSchemas.length > 0, 'root: allSchemas must be a non-empty array')

// --- Server export: plugin factory ------------------------------------------

assert.equal(typeof server.tenancy, 'function', 'server: tenancy must be exported')
const plugin = server.tenancy({
  endpoints: { organization: { create: async () => true } },
})
assert.equal(plugin.id, 'better-auth-tenancy', 'server: plugin id must be "better-auth-tenancy"')
const endpointCount = Object.keys(plugin.endpoints ?? {}).length
assert.ok(
  endpointCount >= 30,
  `server: expected the merged endpoint map to be populated, got ${endpointCount} endpoints`
)
const routes = Object.values(plugin.endpoints ?? {}).map((endpoint) => endpoint?.path)
for (const expected of [
  '/tenancy/organization/create',
  '/tenancy/organization/delete',
  '/tenancy/team/create',
  '/tenancy/role/create',
  '/tenancy/statement/create',
  '/tenancy/member/add',
  '/tenancy/invitation/accept',
  '/tenancy/permission/check',
  '/tenancy/permission/grant',
]) {
  assert.ok(routes.includes(expected), `server: endpoint ${expected} must exist in the merged map`)
}
assert.ok(plugin.schema?.organization, 'server: schema definitions must be present')

// --- Client export: client plugin factory -----------------------------------

assert.equal(typeof client.tenancyClient, 'function', 'client: tenancyClient must be exported')
const clientPlugin = client.tenancyClient({ locale: 'es' })
assert.equal(clientPlugin.id, 'better-auth-tenancy', 'client: plugin id must be "better-auth-tenancy"')
assert.equal(typeof clientPlugin.getActions, 'function', 'client: getActions must be a function')

console.log(`Package smoke test OK (server endpoints: ${endpointCount})`)
