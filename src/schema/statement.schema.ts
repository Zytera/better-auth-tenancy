import * as z from 'zod'
import { generateId } from 'better-auth'

/**
 * Statement schema - Defines individual permissions in the system
 * Format: "category:operation" (e.g., "team:create", "member:add")
 * No wildcards supported as per requirements
 */
export const statementSchema = z.object({
  id: z.string(), // Format: "category:operation"
  category: z.string(), // e.g., "team", "member", "organization"
  operation: z.string(), // e.g., "create", "read", "update", "delete"
  createdAt: z.date().default(() => new Date()),
})

/**
 * Statement Translation schema - Multi-language support for statement names and descriptions
 * Allows the same statement to have different names/descriptions in different locales
 */
export const statementTranslationSchema = z.object({
  id: z.string().default(generateId),
  statementId: z.string(),
  locale: z.string(), // e.g., "en", "es", "fr"
  name: z.string(), // Display name in this locale
  description: z.string().nullish(), // Optional description
  createdAt: z.date().default(() => new Date()),
})

export type Statement = z.infer<typeof statementSchema>
export type StatementTranslation = z.infer<typeof statementTranslationSchema>
