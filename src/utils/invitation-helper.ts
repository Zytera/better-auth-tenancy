import { randomBytes, randomInt } from 'crypto'

/**
 * Alphabet for short invitation codes: 32 unambiguous characters.
 * `I`/`O` and `0`/`1` are excluded so codes can be read out loud and typed
 * by hand without confusion. 8 characters drawn from this alphabet give
 * 32^8 = 2^40 ≈ 1.1 × 10^12 combinations (~40 bits of entropy).
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

/**
 * Generate a secure random token for invitations
 * @param length - Length of the token (default: 32 bytes = 64 hex chars)
 * @returns Hex string token
 */
export function generateInvitationToken(length = 32): string {
  return randomBytes(length).toString('hex')
}

/**
 * Generate a short, human-friendly invitation code
 * Format: 8 characters from an unambiguous 32-character alphabet
 * (A-H J-N P-Z 2-9; I/O/0/1 excluded for manual entry)
 * Example: "ABCD2345", "HJKMNPQR"
 *
 * Drawn with crypto.randomInt (CSPRNG): uniform sampling with no modulo
 * bias, giving 32^8 = 2^40 ≈ 1.1 × 10^12 combinations — ~62,000x the
 * previous 6-character space (26^3 × 10^3 = 17,576,000), which was also
 * generated with the non-cryptographic Math.random(). Online brute force
 * is impractical at realistic rates, but rate limiting on the by-code /
 * accept endpoints remains the consumer's responsibility (see README,
 * Security Best Practices).
 *
 * @returns 8-character uppercase code
 */
export function generateInvitationCode(): string {
  let code = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return code
}

/**
 * Validate invitation code format
 * @param code - Code to validate
 * @returns true if valid format (8 chars from A-H J-N P-Z 2-9)
 */
export function isValidInvitationCode(code: string): boolean {
  return /^[A-HJ-NP-Z2-9]{8}$/.test(code)
}

/**
 * Generate a shareable invitation link
 * @param baseUrl - Base URL of your application
 * @param token - Invitation token
 * @returns Full invitation URL
 */
export function generateInvitationLink(baseUrl: string, token: string): string {
  const url = new URL('/join', baseUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Generate QR code data for invitation
 * Returns a URL that can be encoded into a QR code
 * @param baseUrl - Base URL of your application
 * @param token - Invitation token
 * @returns URL string for QR code
 */
export function generateQRCodeData(baseUrl: string, token: string): string {
  return generateInvitationLink(baseUrl, token)
}

/**
 * Check if invitation has expired
 * @param expiresAt - Expiration date (null = never expires)
 * @returns true if expired
 */
export function isInvitationExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false
  return expiresAt < new Date()
}

/**
 * Check if invitation can still be used
 * @param invitation - Invitation object
 * @returns { canUse: boolean, reason?: string }
 */
export function canUseInvitation(invitation: {
  status: string
  expiresAt?: Date | null | undefined
}): { canUse: boolean; reason?: string } {
  // Check status - invitation can only be used if pending
  if (invitation.status !== 'pending') {
    return { canUse: false, reason: `Invitation is ${invitation.status}` }
  }

  // Check expiration
  if (isInvitationExpired(invitation.expiresAt ?? null)) {
    return { canUse: false, reason: 'Invitation has expired' }
  }

  return { canUse: true }
}

/**
 * Calculate expiration date from hours
 * @param hours - Number of hours until expiration (undefined = never)
 * @returns Date or null
 */
export function calculateExpirationDate(hours: number | undefined): Date | null {
  if (hours === undefined) return null
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}
