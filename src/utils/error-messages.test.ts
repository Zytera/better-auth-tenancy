import { test, expect } from 'bun:test'
import { errorMessages, getErrorMessage, type ErrorMessageKey } from './error-messages'

// Locale selection happens on the first 2 chars of Accept-Language; English is
// the fallback for unknown locales; custom messages override the defaults and
// are interpolated too.

// --- Locale selection ---

test('getErrorMessage: defaults to English when Accept-Language is missing', () => {
  expect(getErrorMessage('role.not_found', null)).toBe('Role not found')
  expect(getErrorMessage('role.not_found', undefined)).toBe('Role not found')
  expect(getErrorMessage('role.not_found', '')).toBe('Role not found')
})

test('getErrorMessage: picks the locale from the first 2 chars, lowercased', () => {
  expect(getErrorMessage('role.not_found', 'es-ES,es;q=0.9,en;q=0.8')).toBe('Rol no encontrado')
  expect(getErrorMessage('role.not_found', 'ES')).toBe('Rol no encontrado')
  expect(getErrorMessage('role.not_found', 'es')).toBe('Rol no encontrado')
})

test('getErrorMessage: falls back to English for unsupported locales', () => {
  expect(getErrorMessage('role.not_found', 'fr-FR,fr;q=0.9')).toBe('Role not found')
  expect(getErrorMessage('role.not_found', 'de')).toBe('Role not found')
})

// --- Interpolation ---

test('getErrorMessage: interpolates params into the message', () => {
  const msg = getErrorMessage('role.limit_reached', 'en', { limit: 5 })
  expect(msg).toBe('Role limit reached (5 maximum)')
})

test('getErrorMessage: interpolates numeric zero correctly', () => {
  expect(getErrorMessage('role.limit_reached', 'en', { limit: 0 })).toBe('Role limit reached (0 maximum)')
})

test('getErrorMessage: interpolates string params', () => {
  expect(getErrorMessage('statement.already_exists', 'en', { id: 'team:read' })).toBe(
    'Statement "team:read" already exists'
  )
})

test('getErrorMessage: keeps the placeholder when a param is missing', () => {
  expect(getErrorMessage('role.limit_reached', 'en', {})).toContain('{{limit}}')
})

test('getErrorMessage: returns the template untouched when no params are given', () => {
  expect(getErrorMessage('role.limit_reached', 'en')).toContain('{{limit}}')
})

test('getErrorMessage: interpolates localized messages', () => {
  expect(getErrorMessage('role.already_exists', 'es', { name: 'Admin' })).toBe('El rol "Admin" ya existe')
})

// --- Custom messages ---

test('getErrorMessage: custom messages override the defaults', () => {
  const msg = getErrorMessage('role.not_found', 'es', undefined, {
    es: { 'role.not_found': 'Rol inexistente' },
  })
  expect(msg).toBe('Rol inexistente')
})

test('getErrorMessage: custom messages are interpolated too', () => {
  const msg = getErrorMessage('role.not_found', 'en', { name: 'Owner' }, {
    en: { 'role.not_found': 'The {{name}} role does not exist' },
  })
  expect(msg).toBe('The Owner role does not exist')
})

test('getErrorMessage: custom messages only apply to their locale', () => {
  const msg = getErrorMessage('role.not_found', 'fr', undefined, {
    es: { 'role.not_found': 'Rol inexistente' },
  })
  expect(msg).toBe('Role not found')
})

// --- Fallback chain ---

test('getErrorMessage: ultimate fallback echoes the key for unknown keys', () => {
  expect(getErrorMessage('bogus.key' as ErrorMessageKey, 'en')).toBe('Error: bogus.key')
})

// --- Completeness: every locale must cover every message key ---

const enKeys = Object.keys(errorMessages.en!).sort()

test('errorMessages: English is non-empty', () => {
  expect(enKeys.length).toBeGreaterThan(0)
})

for (const locale of Object.keys(errorMessages)) {
  test(`errorMessages: locale '${locale}' covers every message key`, () => {
    expect(Object.keys(errorMessages[locale]!).sort()).toEqual(enKeys)
  })
}

test('errorMessages: no template has empty placeholders or dangling braces', () => {
  for (const messages of Object.values(errorMessages)) {
    for (const template of Object.values(messages!)) {
      const open = (template.match(/\{\{/g) ?? []).length
      const close = (template.match(/\}\}/g) ?? []).length
      expect(open).toBe(close)
      expect(template).not.toMatch(/\{\{\s*\}\}/)
    }
  }
})
