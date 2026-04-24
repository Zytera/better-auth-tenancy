/**
 * Error message translations for the tenancy plugin
 * Supports multiple languages based on Accept-Language header
 */

export type ErrorMessageKey =
  // Role errors
  | 'role.delete.in_use_members'
  | 'role.limit_reached'
  | 'role.already_exists'
  | 'role.not_found'

  // Statement errors
  | 'statement.delete.in_use_roles'
  | 'statement.delete.in_use_permissions'
  | 'statement.already_exists'
  | 'statement.not_found'
  | 'statement.invalid_id'

  // Member errors
  | 'member.limit_reached'
  | 'member.not_found'

  // Organization errors
  | 'organization.slug_exists'
  | 'organization.not_found'

  // Team errors
  | 'team.slug_exists'
  | 'team.limit_reached'
  | 'team.not_found'
  | 'team.nesting_depth_exceeded'

  // Invitation errors
  | 'invitation.not_found'
  | 'invitation.expired'
  | 'invitation.already_accepted'

export type ErrorMessageParams = {
  [key: string]: string | number
}

/**
 * Default error messages in English
 */
export const errorMessages: Record<string, Record<ErrorMessageKey, string>> = {
  en: {
    // Role errors
    'role.delete.in_use_members': 'Cannot delete role that is assigned to {{count}} member(s). Please reassign members to another role first.',
    'role.limit_reached': 'Role limit reached ({{limit}} maximum)',
    'role.already_exists': 'Role "{{name}}" already exists',
    'role.not_found': 'Role not found',

    // Statement errors
    'statement.delete.in_use_roles': 'Cannot delete statement that is used in {{count}} role(s). Please remove it from all roles first.',
    'statement.delete.in_use_permissions': 'Cannot delete statement that is used in {{count}} permission(s). Please revoke all permissions using this statement first.',
    'statement.already_exists': 'Statement "{{id}}" already exists',
    'statement.not_found': 'Statement not found',
    'statement.invalid_id': '{{error}}',

    // Member errors
    'member.limit_reached': 'Member limit reached',
    'member.not_found': 'Member not found',

    // Organization errors
    'organization.slug_exists': 'Organization with slug "{{slug}}" already exists',
    'organization.not_found': 'Organization with id "{{id}}" not found',

    // Team errors
    'team.slug_exists': 'Team with slug "{{slug}}" already exists in this context',
    'team.limit_reached': 'Maximum number of teams reached ({{limit}})',
    'team.not_found': 'Team with id "{{id}}" not found',
    'team.nesting_depth_exceeded': 'Maximum nesting depth reached ({{limit}} levels)',

    // Invitation errors
    'invitation.not_found': 'Invitation not found',
    'invitation.expired': 'Invitation has expired',
    'invitation.already_accepted': 'Invitation has already been accepted',
  },

  es: {
    // Role errors
    'role.delete.in_use_members': 'No se puede eliminar el rol asignado a {{count}} miembro(s). Por favor, reasigna los miembros a otro rol primero.',
    'role.limit_reached': 'Límite de roles alcanzado (máximo {{limit}})',
    'role.already_exists': 'El rol "{{name}}" ya existe',
    'role.not_found': 'Rol no encontrado',

    // Statement errors
    'statement.delete.in_use_roles': 'No se puede eliminar el permiso usado en {{count}} rol(es). Por favor, elimínalo de todos los roles primero.',
    'statement.delete.in_use_permissions': 'No se puede eliminar el permiso usado en {{count}} permiso(s). Por favor, revoca todos los permisos que usen este permiso primero.',
    'statement.already_exists': 'El permiso "{{id}}" ya existe',
    'statement.not_found': 'Permiso no encontrado',
    'statement.invalid_id': '{{error}}',

    // Member errors
    'member.limit_reached': 'Límite de miembros alcanzado',
    'member.not_found': 'Miembro no encontrado',

    // Organization errors
    'organization.slug_exists': 'Ya existe una organización con el slug "{{slug}}"',
    'organization.not_found': 'Organización con id "{{id}}" no encontrada',

    // Team errors
    'team.slug_exists': 'Ya existe un equipo con el slug "{{slug}}" en este contexto',
    'team.limit_reached': 'Número máximo de equipos alcanzado ({{limit}})',
    'team.not_found': 'Equipo con id "{{id}}" no encontrado',
    'team.nesting_depth_exceeded': 'Profundidad máxima de anidamiento alcanzada ({{limit}} niveles)',

    // Invitation errors
    'invitation.not_found': 'Invitación no encontrada',
    'invitation.expired': 'La invitación ha expirado',
    'invitation.already_accepted': 'La invitación ya ha sido aceptada',
  },
}

/**
 * Interpolate parameters into message template
 */
function interpolate(template: string, params?: ErrorMessageParams): string {
  if (!params) return template

  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return params[key]?.toString() || match
  })
}

/**
 * Get translated error message based on Accept-Language header
 */
export function getErrorMessage(
  key: ErrorMessageKey,
  acceptLanguage: string | null | undefined,
  params?: ErrorMessageParams,
  customMessages?: Record<string, Record<string, string>>
): string {
  // Extract ISO alpha-2 code (first 2 chars) to match locale format
  const preferredLocale = acceptLanguage ? acceptLanguage.substring(0, 2).toLowerCase() : 'en'

  // Try custom messages first
  if (customMessages?.[preferredLocale]?.[key]) {
    return interpolate(customMessages[preferredLocale][key], params)
  }

  // Try default messages in preferred locale
  if (errorMessages[preferredLocale]?.[key]) {
    return interpolate(errorMessages[preferredLocale][key], params)
  }

  // Fallback to English
  const englishMessage = errorMessages['en']?.[key]
  if (englishMessage) {
    return interpolate(englishMessage, params)
  }

  // Ultimate fallback
  return `Error: ${key}`
}
