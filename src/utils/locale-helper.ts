import type { TenancyConfig } from '../types/config'

/**
 * Parse Accept-Language header and return preferred locale
 *
 * Examples:
 * - "en-US,en;q=0.9,es;q=0.8" → ["en-US", "en", "es"]
 * - "fr-FR,fr;q=0.9" → ["fr-FR", "fr"]
 * - "es" → ["es"]
 *
 * @param acceptLanguage - Accept-Language header value
 * @returns Array of locales ordered by preference (q-factor)
 */
export function parseAcceptLanguage(acceptLanguage: string): string[] {
  if (!acceptLanguage) return []

  return acceptLanguage
    .split(',')
    .map((lang) => {
      const [locale, qValue] = lang.trim().split(';q=')
      const q = qValue ? parseFloat(qValue) : 1.0
      return { locale: (locale || '').trim(), q }
    })
    .filter((item) => item.locale) // Remove empty locales
    .sort((a, b) => b.q - a.q) // Sort by quality factor (highest first)
    .map((item) => item.locale)
}

/**
 * Normalize locale to base language
 * Examples:
 * - "en-US" → "en"
 * - "es-MX" → "es"
 * - "fr" → "fr"
 */
export function normalizeLocale(locale: string): string {
  return locale.split('-')[0]?.toLowerCase() || 'en'
}

/**
 * Get the best matching locale from available translations
 *
 * Tries to find:
 * 1. Exact match (e.g., "en-US")
 * 2. Base language match (e.g., "en" for "en-US")
 * 3. Default locale from config
 * 4. First available translation
 * 5. null if no translations
 *
 * @param acceptLanguage - Accept-Language header value
 * @param availableLocales - Array of available locale codes
 * @param config - Plugin configuration
 * @returns Best matching locale or null
 */
export function getBestLocale(
  acceptLanguage: string | undefined,
  availableLocales: string[],
  config?: TenancyConfig
): string | null {
  if (availableLocales.length === 0) return null

  // Get default locale from config
  const defaultLocale = config?.i18n?.defaultLocale || 'en'

  // If no Accept-Language header, use default
  if (!acceptLanguage) {
    return availableLocales.includes(defaultLocale)
      ? defaultLocale
      : availableLocales[0] || null
  }

  // Parse Accept-Language header
  const preferredLocales = parseAcceptLanguage(acceptLanguage)

  // Try to find exact match first
  for (const locale of preferredLocales) {
    if (availableLocales.includes(locale)) {
      return locale
    }
  }

  // Try to find base language match
  for (const locale of preferredLocales) {
    const baseLocale = normalizeLocale(locale)
    const match = availableLocales.find(
      (available) => normalizeLocale(available) === baseLocale
    )
    if (match) return match
  }

  // Fallback to default locale
  if (availableLocales.includes(defaultLocale)) {
    return defaultLocale
  }

  // Last resort: return first available
  return availableLocales[0] || null
}

/**
 * Extract locale from request headers
 * Supports both lowercase and capitalized header names
 * Handles both Headers object and plain objects
 */
export function getLocaleFromHeaders(
  headers: Record<string, string | string[] | undefined> | Headers | undefined
): string | undefined {
  if (!headers) return undefined

  // Handle Headers object (has .get method)
  if ('get' in headers && typeof headers.get === 'function') {
    return headers.get('accept-language') ?? undefined
  }

  // Handle plain object - type assertion is safe here after the check above
  const plainHeaders = headers as Record<string, string | string[] | undefined>
  const acceptLanguage =
    plainHeaders['accept-language'] ||
    plainHeaders['Accept-Language'] ||
    plainHeaders['ACCEPT-LANGUAGE']

  if (Array.isArray(acceptLanguage)) {
    return acceptLanguage[0]
  }

  return acceptLanguage
}
