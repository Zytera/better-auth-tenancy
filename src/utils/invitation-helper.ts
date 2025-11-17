import { randomBytes } from 'crypto'

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
 * Format: XXXYYY where X = uppercase letter, Y = digit
 * Example: "ABC123", "XYZ789"
 *
 * This provides ~2.2 billion combinations (26^3 * 10^3)
 * which is sufficient for most use cases
 *
 * @returns 6-character code (3 letters + 3 digits)
 */
export function generateInvitationCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const digits = '0123456789'

  // Generate 3 random letters
  let code = ''
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * letters.length)
    code += letters[randomIndex]
  }

  // Generate 3 random digits
  for (let i = 0; i < 3; i++) {
    const randomIndex = Math.floor(Math.random() * digits.length)
    code += digits[randomIndex]
  }

  return code
}

/**
 * Validate invitation code format
 * @param code - Code to validate
 * @returns true if valid format (3 uppercase letters + 3 digits)
 */
export function isValidInvitationCode(code: string): boolean {
  return /^[A-Z]{3}[0-9]{3}$/.test(code)
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
