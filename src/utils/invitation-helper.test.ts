import { test, expect } from 'bun:test'
import {
  generateInvitationToken,
  generateInvitationCode,
  isValidInvitationCode,
  generateInvitationLink,
  generateQRCodeData,
  isInvitationExpired,
  canUseInvitation,
  calculateExpirationDate,
} from './invitation-helper'

// --- generateInvitationToken ---

test('generateInvitationToken: default is 32 bytes as 64 hex chars', () => {
  const token = generateInvitationToken()
  expect(token).toMatch(/^[0-9a-f]{64}$/)
})

test('generateInvitationToken: honors a custom byte length', () => {
  expect(generateInvitationToken(16)).toMatch(/^[0-9a-f]{32}$/)
  expect(generateInvitationToken(8)).toMatch(/^[0-9a-f]{16}$/)
})

test('generateInvitationToken: generates unique tokens', () => {
  const tokens = new Set(Array.from({ length: 100 }, () => generateInvitationToken()))
  expect(tokens.size).toBe(100)
})

// --- generateInvitationCode / isValidInvitationCode ---

test('generateInvitationCode: matches the XXXYYY format (3 letters + 3 digits)', () => {
  for (let i = 0; i < 50; i++) {
    expect(generateInvitationCode()).toMatch(/^[A-Z]{3}[0-9]{3}$/)
  }
})

test('isValidInvitationCode: accepts the documented format', () => {
  expect(isValidInvitationCode('ABC123')).toBe(true)
  expect(isValidInvitationCode('XYZ789')).toBe(true)
})

test('isValidInvitationCode: rejects wrong formats', () => {
  expect(isValidInvitationCode('abc123')).toBe(false) // lowercase letters
  expect(isValidInvitationCode('ABCD23')).toBe(false) // 4 letters
  expect(isValidInvitationCode('AB1234')).toBe(false) // 2 letters, 4 digits
  expect(isValidInvitationCode('AB3D12')).toBe(false) // digit in the letter group
  expect(isValidInvitationCode('')).toBe(false)
  expect(isValidInvitationCode('ABC123 ')).toBe(false) // trailing space
})

test('generateInvitationCode: codes pass its own validator', () => {
  for (let i = 0; i < 20; i++) {
    expect(isValidInvitationCode(generateInvitationCode())).toBe(true)
  }
})

// --- generateInvitationLink / generateQRCodeData ---

test('generateInvitationLink: appends the token as a query param on /join', () => {
  expect(generateInvitationLink('https://app.example.com', 'tok123')).toBe(
    'https://app.example.com/join?token=tok123'
  )
})

test('generateInvitationLink: preserves the base origin with a port', () => {
  expect(generateInvitationLink('http://localhost:3000', 'abc')).toBe(
    'http://localhost:3000/join?token=abc'
  )
})

test('generateQRCodeData: encodes the same link', () => {
  expect(generateQRCodeData('https://app.example.com', 'tok123')).toBe(
    generateInvitationLink('https://app.example.com', 'tok123')
  )
})

// --- isInvitationExpired ---

test('isInvitationExpired: null means never expires', () => {
  expect(isInvitationExpired(null)).toBe(false)
})

test('isInvitationExpired: past dates are expired, future dates are not', () => {
  expect(isInvitationExpired(new Date(Date.now() - 1000))).toBe(true)
  expect(isInvitationExpired(new Date(Date.now() + 86_400_000))).toBe(false)
})

// --- canUseInvitation ---

test('canUseInvitation: pending and unexpired invitations can be used', () => {
  expect(
    canUseInvitation({ status: 'pending', expiresAt: new Date(Date.now() + 60_000) })
  ).toEqual({ canUse: true })
})

test('canUseInvitation: pending without expiration never expires', () => {
  expect(canUseInvitation({ status: 'pending', expiresAt: null })).toEqual({ canUse: true })
  expect(canUseInvitation({ status: 'pending' })).toEqual({ canUse: true })
})

test('canUseInvitation: non-pending status blocks usage with a reason', () => {
  expect(canUseInvitation({ status: 'accepted', expiresAt: null })).toEqual({
    canUse: false,
    reason: 'Invitation is accepted',
  })
  expect(canUseInvitation({ status: 'cancelled', expiresAt: null })).toEqual({
    canUse: false,
    reason: 'Invitation is cancelled',
  })
})

test('canUseInvitation: expiration blocks usage even when pending', () => {
  expect(canUseInvitation({ status: 'pending', expiresAt: new Date(Date.now() - 1000) })).toEqual({
    canUse: false,
    reason: 'Invitation has expired',
  })
})

// --- calculateExpirationDate ---

test('calculateExpirationDate: undefined means no expiration', () => {
  expect(calculateExpirationDate(undefined)).toBeNull()
})

test('calculateExpirationDate: adds the given hours to now', () => {
  const before = Date.now()
  const date = calculateExpirationDate(24)
  const after = Date.now()
  const expected = 24 * 60 * 60 * 1000
  expect(date!.getTime()).toBeGreaterThanOrEqual(before + expected)
  expect(date!.getTime()).toBeLessThanOrEqual(after + expected)
})

test('calculateExpirationDate: zero hours expires immediately (now)', () => {
  const before = Date.now()
  const date = calculateExpirationDate(0)
  expect(date!.getTime()).toBeGreaterThanOrEqual(before)
})
