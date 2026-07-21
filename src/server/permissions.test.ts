import { test, expect } from 'bun:test'
import { resolvePermission } from './permissions'
import type { StatementId } from '../types/statement'

// Minimal in-memory adapter: only the models resolvePermission reads.
// tables: { model: rows[] }; where is matched by field/value equality.
function fakeAdapter(tables: Record<string, any[]>) {
  const match = (row: any, where: any[]) =>
    where.every((w) => row[w.field] === w.value)
  return {
    findMany: async ({ model, where }: any) =>
      (tables[model] ?? []).filter((r) => match(r, where ?? [])),
    findOne: async ({ model, where }: any) =>
      (tables[model] ?? []).find((r) => match(r, where ?? [])) ?? null,
  } as any
}

const stmt = 'team:read' as StatementId
const base = { userId: 'u1', statementId: stmt }

test('role permission (member.roleId -> roleStatement), no grant -> allowed', async () => {
  const adapter = fakeAdapter({
    member: [{ userId: 'u1', contextType: 'team', contextId: 't1', roleId: 'r1' }],
    roleStatement: [{ roleId: 'r1', statementId: stmt }],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(true)
  expect(res.details.source).toBe('role')
})

test('inheritance from parent (org grant -> child team context) -> allowed', async () => {
  const adapter = fakeAdapter({
    team: [{ id: 't1', parentType: 'organization', parentId: 'o1' }],
    permissionGrant: [{ userId: 'u1', statementId: stmt, contextType: 'organization', contextId: 'o1' }],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(true)
})

test('explicit deny wins over grant/role and does not climb', async () => {
  const adapter = fakeAdapter({
    permissionDeny: [{ userId: 'u1', statementId: stmt, contextType: 'team', contextId: 't1' }],
    permissionGrant: [{ userId: 'u1', statementId: stmt, contextType: 'team', contextId: 't1' }],
    team: [{ id: 't1', parentType: 'organization', parentId: 'o1' }],
    permissionGrant_org: [],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(false)
  expect(res.details.source).toBe('deny')
})

test('expired grant + same permission via role -> allowed (regression)', async () => {
  const yesterday = new Date(Date.now() - 86400_000)
  const adapter = fakeAdapter({
    permissionGrant: [{ userId: 'u1', statementId: stmt, contextType: 'team', contextId: 't1', expiresAt: yesterday }],
    member: [{ userId: 'u1', contextType: 'team', contextId: 't1', roleId: 'r1' }],
    roleStatement: [{ roleId: 'r1', statementId: stmt }],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(true)
  expect(res.details.source).toBe('role')
})

test('expired grant with no fallback -> denied but details.expired flagged', async () => {
  const yesterday = new Date(Date.now() - 86400_000)
  const adapter = fakeAdapter({
    permissionGrant: [{ userId: 'u1', statementId: stmt, contextType: 'team', contextId: 't1', expiresAt: yesterday }],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(false)
  expect(res.details.expired).toBe(true)
})

test('cyclic parentId terminates and returns false, no crash', async () => {
  const adapter = fakeAdapter({
    // t1 -> t2 -> t1 cycle
    team: [
      { id: 't1', parentType: 'team', parentId: 't2' },
      { id: 't2', parentType: 'team', parentId: 't1' },
    ],
  })
  const res = await resolvePermission(adapter, { ...base, contextType: 'team', contextId: 't1' })
  expect(res.allowed).toBe(false)
})