/**
 * Better Auth Tenancy - Client Plugin
 *
 * Guard rail fallback - use platform-specific imports instead.
 *
 * 📱 React Native/Expo: import from "@zytera/better-auth-tenancy/clients/native"
 * 🌐 Web/Browser: import from "@zytera/better-auth-tenancy/clients/web"
 * 🖥️ Server: import from "@zytera/better-auth-tenancy"
 */

// Shared types
export type * from '../types'

/**
 * @deprecated Use platform-specific imports instead:
 * - React Native/Expo: import { tenancyClient } from "@zytera/better-auth-tenancy/clients/native"
 * - Web/Browser: import { tenancyClient } from "@zytera/better-auth-tenancy/clients/web"
 *
 * This fallback export is provided for backwards compatibility but may
 * cause environment-specific issues. Prefer platform-specific imports.
 */
export function tenancyClient() {
  throw new Error(`
🚫 Platform-specific import required!

Please use the appropriate import for your environment:

📱 React Native/Expo:
   import { tenancyClient } from "@zytera/better-auth-tenancy/client/native"

🌐 Web/Browser:
   import { tenancyClient } from "@zytera/better-auth-tenancy/client/web"

🖥️ Server (Better Auth):
   import { tenancy } from "@zytera/better-auth-tenancy"

This prevents cookie/credential handling issues and provides
optimized implementations for each platform.
  `)
}
