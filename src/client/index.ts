/**
 * Better Auth Tenancy - Frontend Client
 *
 * Type-safe client for interacting with Better Auth Tenancy APIs from the frontend.
 * Works on web, React Native, Node.js, and edge runtimes.
 *
 * @example
 * ```typescript
 * import { tenancyClient } from '@zytera/better-auth-tenancy/client'
 *
 * const client = tenancyClient({
 *   baseUrl: '/api/auth',
 *   locale: 'es', // Optional: for i18n
 * })
 *
 * // Use the client
 * const org = await client.organizations.create({
 *   name: 'Acme Corp',
 *   slug: 'acme',
 * })
 *
 * const hasPermission = await client.permissions.check({
 *   userId: 'user-123',
 *   statementId: 'team:create',
 *   contextType: 'organization',
 *   contextId: org.id,
 * })
 * ```
 */

import type { ContextType } from '../types/context'
import type { StatementId } from '../types/statement'
import type {
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from '../server/organizations'
import type { CreateTeamInput, UpdateTeamInput } from '../server/teams'
import type { CreateSubteamInput, UpdateSubteamInput } from '../server/subteams'
import type {
  AddMemberInput,
  UpdateMemberRoleInput,
} from '../server/members'
import type {
  GrantPermissionInput,
  DenyPermissionInput,
  RevokePermissionInput,
  CheckPermissionInput,
} from '../server/permissions'
import type {
  CreateInvitationInput,
  AcceptInvitationInput,
  RejectInvitationInput,
  CancelInvitationInput,
} from '../types/invitation'
import type {
  CreateStatementInput,
  StatementTranslationInput,
} from '../types/statement'
import type {
  CreateRoleInput,
  UpdateRoleInput,
  AddStatementsToRoleInput,
  RemoveStatementsFromRoleInput,
  RoleType,
} from '../types/role'

export interface TenancyClientConfig {
  baseUrl?: string
  fetch?: typeof fetch
  headers?: Record<string, string>
  locale?: string // Preferred locale for i18n (e.g., 'en', 'es', 'fr')
}

export interface FetchOptions {
  method: string
  headers?: Record<string, string>
  body?: string
}

export class TenancyClient {
  private baseUrl: string
  private fetch: typeof fetch
  private headers: Record<string, string>
  private locale?: string

  constructor(config: TenancyClientConfig = {}) {
    this.baseUrl = config.baseUrl ?? '/api/auth'
    this.fetch = config.fetch ?? globalThis.fetch
    this.locale = config.locale
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    }

    // Add Accept-Language header if locale is specified
    if (this.locale) {
      this.headers['Accept-Language'] = this.locale
    }
  }

  /**
   * Set the preferred locale for API requests
   * This will add/update the Accept-Language header
   */
  setLocale(locale: string): void {
    this.locale = locale
    this.headers['Accept-Language'] = locale
  }

  /**
   * Get the current locale setting
   */
  getLocale(): string | undefined {
    return this.locale
  }

  /**
   * Internal fetch wrapper
   */
  private async request<T>(path: string, options: FetchOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const response = await this.fetch(url, {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
      },
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText })) as { message?: string }
      throw new Error(error?.message || `HTTP ${response.status}: ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  /**
   * Organizations API
   */
  organizations = {
    create: (input: Omit<CreateOrganizationInput, 'createdBy'>) =>
      this.request('/organizations', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    get: (id: string) =>
      this.request(`/organizations/${id}`, {
        method: 'GET',
      }),

    getBySlug: (slug: string) =>
      this.request(`/organizations/slug/${slug}`, {
        method: 'GET',
      }),

    update: (id: string, input: Omit<UpdateOrganizationInput, 'updatedBy'>) =>
      this.request(`/organizations/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    delete: (id: string) =>
      this.request(`/organizations/${id}`, {
        method: 'DELETE',
      }),

    list: (options?: { limit?: number; offset?: number }) =>
      this.request(`/organizations${options ? `?${new URLSearchParams(options as any)}` : ''}`, {
        method: 'GET',
      }),
  }

  /**
   * Teams API
   */
  teams = {
    create: (input: Omit<CreateTeamInput, 'createdBy'>) =>
      this.request('/teams', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    get: (id: string) =>
      this.request(`/teams/${id}`, {
        method: 'GET',
      }),

    update: (id: string, input: Omit<UpdateTeamInput, 'updatedBy'>) =>
      this.request(`/teams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    delete: (id: string) =>
      this.request(`/teams/${id}`, {
        method: 'DELETE',
      }),

    listByOrganization: (organizationId: string, options?: { limit?: number; offset?: number }) =>
      this.request(
        `/organizations/${organizationId}/teams${options ? `?${new URLSearchParams(options as any)}` : ''}`,
        {
          method: 'GET',
        }
      ),
  }

  /**
   * Subteams API
   */
  subteams = {
    create: (input: Omit<CreateSubteamInput, 'createdBy'>) =>
      this.request('/subteams', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    get: (id: string) =>
      this.request(`/subteams/${id}`, {
        method: 'GET',
      }),

    update: (id: string, input: Omit<UpdateSubteamInput, 'updatedBy'>) =>
      this.request(`/subteams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    delete: (id: string) =>
      this.request(`/subteams/${id}`, {
        method: 'DELETE',
      }),

    listByTeam: (teamId: string, options?: { limit?: number; offset?: number }) =>
      this.request(
        `/teams/${teamId}/subteams${options ? `?${new URLSearchParams(options as any)}` : ''}`,
        {
          method: 'GET',
        }
      ),
  }

  /**
   * Statements API
   */
  statements = {
    create: (input: CreateStatementInput) =>
      this.request('/statements', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    get: (id: StatementId) =>
      this.request(`/statements/${id}`, {
        method: 'GET',
      }),

    getWithTranslations: (id: StatementId) =>
      this.request(`/statements/${id}/translations`, {
        method: 'GET',
      }),

    listAll: () =>
      this.request('/statements', {
        method: 'GET',
      }),

    listByCategory: (category: string) =>
      this.request(`/statements/category/${category}`, {
        method: 'GET',
      }),

    delete: (id: StatementId) =>
      this.request(`/statements/${id}`, {
        method: 'DELETE',
      }),

    addTranslation: (statementId: StatementId, translation: StatementTranslationInput) =>
      this.request(`/statements/${statementId}/translations`, {
        method: 'POST',
        body: JSON.stringify(translation),
      }),
  }

  /**
   * Roles API
   */
  roles = {
    create: (input: Omit<CreateRoleInput, 'createdBy'>) =>
      this.request('/roles', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    get: (id: string, contextType: RoleType) =>
      this.request(`/roles/${id}?contextType=${contextType}`, {
        method: 'GET',
      }),

    update: (id: string, input: Omit<UpdateRoleInput, 'updatedBy'>, contextType: RoleType) =>
      this.request(`/roles/${id}?contextType=${contextType}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    delete: (id: string, contextType: RoleType) =>
      this.request(`/roles/${id}?contextType=${contextType}`, {
        method: 'DELETE',
      }),

    list: (contextType: RoleType, contextId: string) =>
      this.request(`/roles?contextType=${contextType}&contextId=${contextId}`, {
        method: 'GET',
      }),

    addStatements: (input: AddStatementsToRoleInput, contextType: RoleType) =>
      this.request(`/roles/${input.roleId}/statements?contextType=${contextType}`, {
        method: 'POST',
        body: JSON.stringify({ statements: input.statements }),
      }),

    removeStatements: (input: RemoveStatementsFromRoleInput, contextType: RoleType) =>
      this.request(`/roles/${input.roleId}/statements?contextType=${contextType}`, {
        method: 'DELETE',
        body: JSON.stringify({ statements: input.statements }),
      }),
  }

  /**
   * Members API
   */
  members = {
    add: (input: Omit<AddMemberInput, 'addedBy'>) =>
      this.request('/members', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    updateRole: (input: Omit<UpdateMemberRoleInput, 'updatedBy'>) =>
      this.request('/members/role', {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),

    remove: (userId: string, contextType: ContextType, contextId: string) =>
      this.request('/members', {
        method: 'DELETE',
        body: JSON.stringify({ userId, contextType, contextId }),
      }),

    list: (contextType: ContextType, contextId: string) =>
      this.request(`/members?contextType=${contextType}&contextId=${contextId}`, {
        method: 'GET',
      }),
  }

  /**
   * Permissions API
   */
  permissions = {
    grant: (input: Omit<GrantPermissionInput, 'grantedBy'>) =>
      this.request('/permissions/grant', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    deny: (input: Omit<DenyPermissionInput, 'deniedBy'>) =>
      this.request('/permissions/deny', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    revoke: (input: Omit<RevokePermissionInput, 'revokedBy'>) =>
      this.request('/permissions/revoke', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    check: (input: CheckPermissionInput) =>
      this.request('/permissions/check', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    listGrants: (userId: string, contextType?: ContextType, contextId?: string) =>
      this.request(
        `/permissions/grants/${userId}${contextType && contextId ? `?contextType=${contextType}&contextId=${contextId}` : ''}`,
        {
          method: 'GET',
        }
      ),

    listDenies: (userId: string, contextType?: ContextType, contextId?: string) =>
      this.request(
        `/permissions/denies/${userId}${contextType && contextId ? `?contextType=${contextType}&contextId=${contextId}` : ''}`,
        {
          method: 'GET',
        }
      ),
  }

  /**
   * Invitations API - Flexible invitation system
   * Supports: email/SMS, shareable links, QR codes, short codes, multi-use
   */
  invitations = {
    /**
     * Create a new invitation
     * @param input - Invitation details (identifier is optional - can be email, phone, username, or null)
     */
    create: (input: Omit<CreateInvitationInput, 'invitedBy'>) =>
      this.request('/invitation/create', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /**
     * Accept invitation by token (from link/QR) or code (manual entry)
     * @param input - Must provide either token or invitationCode
     */
    accept: (input: AcceptInvitationInput) =>
      this.request('/invitation/accept', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /**
     * Reject/decline invitation by token or code
     */
    reject: (input: RejectInvitationInput) =>
      this.request('/invitation/reject', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /**
     * Cancel invitation (admin action)
     */
    cancel: (input: Omit<CancelInvitationInput, 'cancelledBy'>) =>
      this.request('/invitation/cancel', {
        method: 'POST',
        body: JSON.stringify(input),
      }),

    /**
     * Get invitation details by token (for links/QR codes)
     */
    getByToken: (token: string) =>
      this.request(`/invitation/by-token/${token}`, {
        method: 'GET',
      }),

    /**
     * Get invitation details by short code (for manual entry)
     * @param code - 6-character code like "ABC123"
     */
    getByCode: (code: string) =>
      this.request(`/invitation/by-code/${code.toUpperCase()}`, {
        method: 'GET',
      }),

    /**
     * Get invitations by identifier (email, phone, username, etc.)
     */
    getByIdentifier: (identifier: string, status?: string) =>
      this.request(`/invitation/by-identifier/${identifier}${status ? `?status=${status}` : ''}`, {
        method: 'GET',
      }),

    /**
     * List invitations for a context
     */
    list: (contextType: ContextType, contextId: string, options?: { status?: string; limit?: number; offset?: number }) =>
      this.request(`/invitation/list/${contextType}/${contextId}${options ? `?${new URLSearchParams(options as any)}` : ''}`, {
        method: 'GET',
      }),

    /**
     * Cleanup expired invitations (cron job)
     */
    cleanupExpired: () =>
      this.request('/invitation/cleanup-expired', {
        method: 'POST',
      }),
  }
}

/**
 * Create Better Auth Tenancy client
 */
export function tenancyClient(
  config: TenancyClientConfig = {}
): TenancyClient {
  return new TenancyClient(config)
}

// Export types
export type * from '../types'
