import { test, expect } from 'bun:test'
import { tenancy, isTenancyPlugin } from './plugin'
import type { TenancyConfig } from '../types'

/**
 * Unit tests for the plugin factory itself: shape of the returned plugin,
 * configuration validation, and the fail-closed startup warning introduced
 * with the CWE-862 fix (no endpoint hooks configured -> loud console warning).
 */

/** Run `fn` capturing console.warn output without leaking the spy. */
function captureWarnings(fn: () => void): string[] {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (msg?: unknown) => {
    warnings.push(String(msg))
  }
  try {
    fn()
  } finally {
    console.warn = original
  }
  return warnings
}

const okHook = async () => true

// --- Plugin shape ---

test('tenancy: returns the tenancy plugin with a merged endpoint map', () => {
  const plugin = tenancy()
  expect(plugin.id).toBe('better-auth-tenancy')
  expect(Object.keys(plugin.endpoints).length).toBeGreaterThan(30)
})

test('tenancy: exposes all module endpoints (org, team, statement, role, member, invitation, permission)', () => {
  const plugin = tenancy()
  const routes = Object.values(plugin.endpoints).map((endpoint: any) => endpoint?.path)
  for (const path of [
    '/tenancy/organization/create',
    '/tenancy/organization/delete',
    '/tenancy/team/create',
    '/tenancy/statement/create',
    '/tenancy/role/create',
    '/tenancy/member/add',
    '/tenancy/invitation/accept',
    '/tenancy/permission/check',
    '/tenancy/permission/grant',
  ]) {
    expect(routes, `missing endpoint ${path}`).toContain(path)
  }
})

test('tenancy: declares schema definitions for every model', () => {
  const plugin = tenancy()
  for (const model of [
    'organization',
    'team',
    'statement',
    'statementTranslation',
    'role',
    'roleStatement',
    'roleTranslation',
    'member',
    'permissionGrant',
    'permissionDeny',
    'invitation',
  ]) {
    expect((plugin.schema as any)[model], `missing schema for ${model}`).toBeTruthy()
  }
})

test('tenancy: keeps the consumer config as plugin options', () => {
  const config: TenancyConfig = { limits: { maxTeamsPerOrganization: 5 } }
  expect(tenancy(config).options).toBe(config)
  expect(tenancy().options).toBeUndefined()
})

// --- Fail-closed startup warning ---

test('tenancy: warns loudly when no endpoint hooks are configured', () => {
  const warnings = captureWarnings(() => tenancy())
  expect(warnings).toHaveLength(1)
  expect(warnings[0]).toContain('[BetterAuthTenancy]')
  expect(warnings[0]).toContain('config.endpoints')
  expect(warnings[0]).toContain('fails closed')
})

test('tenancy: warns when the endpoints config exists but defines no hook', () => {
  const warnings = captureWarnings(() =>
    tenancy({ endpoints: { organization: {} } } as unknown as TenancyConfig)
  )
  expect(warnings).toHaveLength(1)
})

test('tenancy: warns when endpoint entries are not functions', () => {
  const warnings = captureWarnings(() =>
    tenancy({
      endpoints: { organization: { create: 'not-a-function' } },
    } as unknown as TenancyConfig)
  )
  expect(warnings).toHaveLength(1)
})

test('tenancy: does not warn when at least one hook is configured', () => {
  const warnings = captureWarnings(() =>
    tenancy({ endpoints: { organization: { create: okHook } } })
  )
  expect(warnings).toHaveLength(0)
})

// --- Configuration validation ---

test('tenancy: accepts a fully valid config without throwing', () => {
  expect(() =>
    tenancy({
      limits: { maxTeamsPerOrganization: 10, maxMembersPerOrganization: 1000 },
      cache: { get: okHook, set: okHook, invalidate: okHook },
      audit: { onEntityCreated: okHook, onPermissionGranted: okHook },
      invitation: { defaultExpirationHours: 48 },
    })
  ).not.toThrow()
})

test('tenancy: rejects non-function cache hooks', () => {
  expect(() => tenancy({ cache: { get: 'x' } as any })).toThrow('cache.get must be a function')
  expect(() => tenancy({ cache: { get: okHook, set: 'x' } as any })).toThrow('cache.set must be a function')
  expect(() => tenancy({ cache: { get: okHook, set: okHook, invalidate: null } as any })).toThrow(
    'cache.invalidate must be a function'
  )
})

test('tenancy: rejects non-function audit hooks', () => {
  expect(() => tenancy({ audit: { onEntityCreated: 42 } as any })).toThrow(
    'All audit hooks must be functions'
  )
})

test('tenancy: rejects non-positive limits', () => {
  expect(() => tenancy({ limits: { maxTeamsPerOrganization: 0 } })).toThrow(
    'All limits must be positive numbers'
  )
  expect(() => tenancy({ limits: { maxMembersPerOrganization: -5 } })).toThrow(
    'All limits must be positive numbers'
  )
})

test('tenancy: accepts explicitly undefined limits', () => {
  expect(() => tenancy({ limits: { maxTeamsPerOrganization: undefined } })).not.toThrow()
})

test('tenancy: rejects non-positive invitation expiration', () => {
  expect(() => tenancy({ invitation: { defaultExpirationHours: 0 } })).toThrow(
    'invitation.defaultExpirationHours must be a positive number'
  )
  expect(() => tenancy({ invitation: { defaultExpirationHours: -1 } })).toThrow(
    'invitation.defaultExpirationHours must be a positive number'
  )
})

// --- Type guard ---

test('isTenancyPlugin: true for tenancy plugins, false otherwise', () => {
  expect(isTenancyPlugin(tenancy())).toBe(true)
  expect(isTenancyPlugin({ id: 'better-auth-tenancy' })).toBe(true)
  expect(isTenancyPlugin({ id: 'other-plugin' })).toBe(false)
  expect(isTenancyPlugin({})).toBe(false)
  expect(isTenancyPlugin(null)).toBe(false)
  expect(isTenancyPlugin(undefined)).toBe(false)
  expect(isTenancyPlugin('better-auth-tenancy')).toBe(false)
})
