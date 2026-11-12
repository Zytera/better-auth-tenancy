import { test, expect } from 'bun:test'
import { getLocaleFromHeaders, resolveRoleTranslation } from './locale-helper'

// --- getLocaleFromHeaders ---

test('getLocaleFromHeaders: reads a Headers object (case-insensitive)', () => {
  expect(getLocaleFromHeaders(new Headers({ 'accept-language': 'es-ES,es;q=0.9' }))).toBe('es')
  expect(getLocaleFromHeaders(new Headers({ 'Accept-Language': 'fr-FR' }))).toBe('fr')
})

test('getLocaleFromHeaders: falls back to the default when the Headers object is empty', () => {
  expect(getLocaleFromHeaders(new Headers())).toBe('en')
  expect(getLocaleFromHeaders(new Headers(), 'pt')).toBe('pt')
})

test('getLocaleFromHeaders: reads plain objects with any header casing', () => {
  expect(getLocaleFromHeaders({ 'accept-language': 'es' })).toBe('es')
  expect(getLocaleFromHeaders({ 'Accept-Language': 'es' })).toBe('es')
  expect(getLocaleFromHeaders({ 'ACCEPT-LANGUAGE': 'es' })).toBe('es')
})

test('getLocaleFromHeaders: takes the first value from array headers', () => {
  expect(getLocaleFromHeaders({ 'accept-language': ['de', 'en'] })).toBe('de')
})

test('getLocaleFromHeaders: returns the default locale for missing/undefined headers', () => {
  expect(getLocaleFromHeaders(undefined)).toBe('en')
  expect(getLocaleFromHeaders(undefined, 'es')).toBe('es')
  expect(getLocaleFromHeaders({})).toBe('en')
  expect(getLocaleFromHeaders({ 'accept-language': undefined }, 'it')).toBe('it')
})

test('getLocaleFromHeaders: always returns an ISO alpha-2 lowercase code', () => {
  expect(getLocaleFromHeaders({ 'accept-language': 'PT-BR' })).toBe('pt')
  expect(getLocaleFromHeaders({ 'accept-language': 'ZH' })).toBe('zh')
})

// --- resolveRoleTranslation ---

/**
 * Fake adapter keyed by requested locale; records every query so tests can
 * assert how many lookups the fallback chain performs.
 */
function fakeAdapter(byLocale: Record<string, any[]>) {
  const queries: string[] = []
  return {
    queries,
    findMany: async ({ where }: any) => {
      const locale = where?.find((w: any) => w.field === 'locale')?.value
      const roleId = where?.find((w: any) => w.field === 'roleId')?.value
      queries.push(`${roleId}@${locale}`)
      return byLocale[locale] ?? []
    },
  } as any
}

test('resolveRoleTranslation: returns the translation for the requested locale', async () => {
  const row = { id: 't1', roleId: 'r1', locale: 'es', name: 'Administrador' }
  const adapter = fakeAdapter({ es: [row] })
  const result = await resolveRoleTranslation(adapter, 'r1', 'es')
  expect(result).toEqual(row)
  expect(adapter.queries).toEqual(['r1@es'])
})

test('resolveRoleTranslation: falls back to the English translation', async () => {
  const enRow = { id: 't2', roleId: 'r1', locale: 'en', name: 'Administrator' }
  const adapter = fakeAdapter({ en: [enRow] })
  const result = await resolveRoleTranslation(adapter, 'r1', 'fr')
  expect(result).toEqual(enRow)
  expect(adapter.queries).toEqual(['r1@fr', 'r1@en'])
})

test('resolveRoleTranslation: returns null when nothing exists in any locale', async () => {
  const adapter = fakeAdapter({})
  expect(await resolveRoleTranslation(adapter, 'r1', 'fr')).toBeNull()
  expect(adapter.queries).toEqual(['r1@fr', 'r1@en'])
})

test('resolveRoleTranslation: English requests never trigger a second query', async () => {
  const adapter = fakeAdapter({})
  expect(await resolveRoleTranslation(adapter, 'r1', 'en')).toBeNull()
  expect(adapter.queries).toEqual(['r1@en'])
})

test('resolveRoleTranslation: adapter errors are treated as empty results', async () => {
  const adapter = {
    findMany: async () => {
      throw new Error('db down')
    },
  } as any
  expect(await resolveRoleTranslation(adapter, 'r1', 'fr')).toBeNull()
  expect(await resolveRoleTranslation(adapter, 'r1', 'en')).toBeNull()
})

test('resolveRoleTranslation: prefers the first row when several match', async () => {
  const rows = [
    { id: 't1', locale: 'es', name: 'first' },
    { id: 't2', locale: 'es', name: 'second' },
  ]
  const adapter = fakeAdapter({ es: rows })
  const result = await resolveRoleTranslation(adapter, 'r1', 'es')
  expect(result?.name).toBe('first')
})
