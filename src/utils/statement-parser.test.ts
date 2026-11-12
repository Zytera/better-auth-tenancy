import { test, expect } from 'bun:test'
import { parseStatementId, buildStatementId, validateStatementId } from './statement-parser'

// Statement format: "category:operation" (no wildcards, one colon).

// --- parseStatementId ---

test('parseStatementId: parses a valid statement id', () => {
  expect(parseStatementId('team:read')).toEqual({
    id: 'team:read',
    category: 'team',
    operation: 'read',
  })
})

test('parseStatementId: trims surrounding whitespace in both parts', () => {
  expect(parseStatementId(' patient :read ')).toEqual({
    id: ' patient :read ',
    category: 'patient',
    operation: 'read',
  })
})

test('parseStatementId: returns null for empty input', () => {
  expect(parseStatementId('')).toBeNull()
})

test('parseStatementId: returns null for non-string input', () => {
  expect(parseStatementId(123 as unknown as string)).toBeNull()
})

test('parseStatementId: returns null when there is no colon', () => {
  expect(parseStatementId('team-read')).toBeNull()
})

test('parseStatementId: returns null when there is more than one colon', () => {
  expect(parseStatementId('team:read:all')).toBeNull()
})

test('parseStatementId: returns null for empty category or operation', () => {
  expect(parseStatementId(':read')).toBeNull()
  expect(parseStatementId('team:')).toBeNull()
  expect(parseStatementId(':')).toBeNull()
})

test('parseStatementId: returns null for whitespace-only parts', () => {
  expect(parseStatementId('  :read')).toBeNull()
  expect(parseStatementId('team:  ')).toBeNull()
})

// --- buildStatementId ---

test('buildStatementId: joins category and operation', () => {
  expect(buildStatementId('team', 'create')).toBe('team:create')
})

test('buildStatementId: rejects missing category or operation', () => {
  expect(() => buildStatementId('', 'read')).toThrow('Category and operation are required')
  expect(() => buildStatementId('team', '')).toThrow('Category and operation are required')
})

test('buildStatementId: round-trips through parseStatementId', () => {
  const id = buildStatementId('patient', 'update')
  expect(parseStatementId(id)?.category).toBe('patient')
  expect(parseStatementId(id)?.operation).toBe('update')
})

// --- validateStatementId ---

test('validateStatementId: accepts a valid lowercase id', () => {
  const result = validateStatementId('team:read')
  expect(result.isValid).toBe(true)
  expect(result.error).toBeUndefined()
  expect(result.parsed).toEqual({ id: 'team:read', category: 'team', operation: 'read' })
})

test('validateStatementId: accepts uppercase letters (case-insensitive pattern)', () => {
  expect(validateStatementId('Team:READ').isValid).toBe(true)
})

test('validateStatementId: accepts underscores and hyphens', () => {
  expect(validateStatementId('my-team:read_all').isValid).toBe(true)
})

test('validateStatementId: rejects ids without the category:operation shape', () => {
  const result = validateStatementId('team-read')
  expect(result.isValid).toBe(false)
  expect(result.error).toBe('Statement ID must be in format "category:operation"')
})

test('validateStatementId: rejects extra colons', () => {
  expect(validateStatementId('team:read:all').isValid).toBe(false)
})

test('validateStatementId: rejects invalid characters', () => {
  for (const id of ['team:read!', 'team rea:d', 'team:read/something', ' team:read ']) {
    const result = validateStatementId(id)
    expect(result.isValid).toBe(false)
    expect(result.error).toBe(
      'Statement ID can only contain letters, numbers, underscores, hyphens, and one colon'
    )
  }
})

test('validateStatementId: rejects empty input', () => {
  expect(validateStatementId('').isValid).toBe(false)
})
