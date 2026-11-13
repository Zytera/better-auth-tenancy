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

test('generateInvitationCode: matches the documented 8-character format', () => {
  for (let i = 0; i < 200; i++) {
    expect(generateInvitationCode()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/)
  }
})

test('generateInvitationCode: never contains ambiguous characters (I, O, 0, 1)', () => {
  for (let i = 0; i < 2000; i++) {
    expect(generateInvitationCode()).not.toMatch(/[IO01]/)
  }
})

test('isValidInvitationCode: accepts the documented format', () => {
  expect(isValidInvitationCode('ABCDEFGH')).toBe(true)
  expect(isValidInvitationCode('JKLMNPQR')).toBe(true)
  expect(isValidInvitationCode('A2B3C4D5')).toBe(true) // letters and digits mixed
})

test('isValidInvitationCode: rejects legacy 6-character codes', () => {
  expect(isValidInvitationCode('ABC123')).toBe(false) // old XXXYYY format
  expect(isValidInvitationCode('XYZ789')).toBe(false)
})

test('isValidInvitationCode: rejects wrong formats', () => {
  expect(isValidInvitationCode('ABCDEFG')).toBe(false) // too short (7 chars)
  expect(isValidInvitationCode('ABCDEFGHJ')).toBe(false) // too long (9 chars)
  expect(isValidInvitationCode('abcdefgh')).toBe(false) // lowercase letters
  expect(isValidInvitationCode('IBCDEFGH')).toBe(false) // ambiguous I
  expect(isValidInvitationCode('OBCDEFGH')).toBe(false) // ambiguous O
  expect(isValidInvitationCode('1BCDEFGH')).toBe(false) // ambiguous 1
  expect(isValidInvitationCode('')).toBe(false)
  expect(isValidInvitationCode('ABCDEFG ')).toBe(false) // trailing space
})

test('generateInvitationCode: codes pass its own validator', () => {
  for (let i = 0; i < 100; i++) {
    expect(isValidInvitationCode(generateInvitationCode())).toBe(true)
  }
})

test('generateInvitationCode: generates unique codes', () => {
  const codes = new Set(Array.from({ length: 1000 }, () => generateInvitationCode()))
  expect(codes.size).toBe(1000)
})

test('generateInvitationCode: covers the whole alphabet (no hotspots)', () => {
  const observed = new Set<string>()
  for (let i = 0; i < 2000; i++) {
    for (const char of generateInvitationCode()) observed.add(char)
  }
  // 16,000 draws over a 32-char alphabet: expected ~500 occurrences per
  // character, so observing all 32 is the overwhelmingly likely outcome.
  expect(observed.size).toBe(32)
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
