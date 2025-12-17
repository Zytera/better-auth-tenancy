/**
 * Extract locale from request headers and return ISO alpha-2 code
 *
 * Supports both lowercase and capitalized header names
 * Handles both Headers object and plain objects
 * Always returns ISO alpha-2 code (first 2 chars) in lowercase
 *
 * @param headers - Request headers (Headers object or plain object)
 * @param defaultLocale - Default locale to use if Accept-Language header is not found (defaults to 'en')
 * @returns ISO alpha-2 language code (e.g., 'en', 'es', 'fr')
 *
 * @example
 * getLocaleFromHeaders(ctx.headers, 'es') // 'es' if no Accept-Language
 * getLocaleFromHeaders(ctx.headers) // 'en' if no Accept-Language
 */
export function getLocaleFromHeaders(
  headers: Record<string, string | string[] | undefined> | Headers | undefined,
  defaultLocale?: string
): string {
  let acceptLanguage: string | undefined

  if (headers) {
    // Handle Headers object (has .get method)
    if ('get' in headers && typeof headers.get === 'function') {
      acceptLanguage = headers.get('accept-language') ?? undefined
    } else {
      // Handle plain object - type assertion is safe here after the check above
      const plainHeaders = headers as Record<string, string | string[] | undefined>
      const headerValue =
        plainHeaders['accept-language'] ||
        plainHeaders['Accept-Language'] ||
        plainHeaders['ACCEPT-LANGUAGE']

      if (Array.isArray(headerValue)) {
        acceptLanguage = headerValue[0]
      } else {
        acceptLanguage = headerValue
      }
    }
  }

  // If Accept-Language is found, extract ISO alpha-2 code (first 2 chars)
  if (acceptLanguage) {
    return acceptLanguage.substring(0, 2).toLowerCase()
  }

  // Fallback to defaultLocale or 'en'
  return defaultLocale || 'en'
}
