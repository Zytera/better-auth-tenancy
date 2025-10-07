import type { BetterAuthClientPlugin } from "better-auth/client";
import type { permissionsPlugin } from "../server";
import type { PermissionContext, PermissionExpression } from "../types";

// ============================================================================
// CLIENT PLUGIN FOR BETTER AUTH PERMISSIONS
// ============================================================================

export const permissionsClient = () => {
    return {
        id: "permissions",
        $InferServerPlugin: {} as ReturnType<typeof permissionsPlugin>,
        getActions: ($fetch: any) => ({
            createMedicalUnit: async (params: {
                name: string;
                teamId: string;
                metadata?: string;
            }) => {
                return await $fetch("/permissions/medical-unit/create", {
                    method: "POST",
                    body: params,
                });
            },

            listMedicalUnitsByTeam: async (teamId: string) => {
                return await $fetch("/permissions/medical-unit/list", {
                    method: "GET",
                    query: { teamId },
                });
            },

            createScope: async (params: {
                name: string;
                translations?: Array<{
                    language: string;
                    name: string;
                    description?: string;
                }>;
            }) => {
                return await $fetch("/permissions/scope/create", {
                    method: "POST",
                    body: params,
                });
            },

            addScopeTranslation: async (params: {
                scopeId: string;
                language: string;
                name: string;
                description?: string;
            }) => {
                return await $fetch("/permissions/scope/translation/add", {
                    method: "POST",
                    body: params,
                });
            },

            listScopes: async () => {
                return await $fetch("/permissions/scope/list", {
                    method: "GET",
                });
            },

            createScopeGroup: async (params: {
                name: string;
                scopes: string[];
                translations?: Array<{
                    language: string;
                    name: string;
                    description?: string;
                }>;
            }) => {
                return await $fetch("/permissions/scope-group/create", {
                    method: "POST",
                    body: params,
                });
            },

            addScopeGroupTranslation: async (params: {
                scopeGroupId: string;
                language: string;
                name: string;
                description?: string;
            }) => {
                return await $fetch("/permissions/scope-group/translation/add", {
                    method: "POST",
                    body: params,
                });
            },

            assignOrganizationScopeGroup: async (params: {
                userId: string;
                organizationId: string;
                scopeGroupName: string;
            }) => {
                return await $fetch("/permissions/assign/organization/scope-group", {
                    method: "POST",
                    body: params,
                });
            },

            assignTeamScopeGroup: async (params: {
                userId: string;
                teamId: string;
                scopeGroupName: string;
            }) => {
                return await $fetch("/permissions/assign/team/scope-group", {
                    method: "POST",
                    body: params,
                });
            },

            assignMedicalUnitScopeGroup: async (params: {
                userId: string;
                medicalUnitId: string;
                scopeGroupName: string;
            }) => {
                return await $fetch("/permissions/assign/medical-unit/scope-group", {
                    method: "POST",
                    body: params,
                });
            },

            checkPermission: async (params: {
                userId: string;
                scopeName: string;
                context: PermissionContext;
            }) => {
                return await $fetch("/permissions/check", {
                    method: "POST",
                    body: params,
                });
            },

            checkPermissions: async (params: {
                userId: string;
                expression: PermissionExpression;
                context: PermissionContext;
            }) => {
                return await $fetch("/permissions/check-multiple", {
                    method: "POST",
                    body: params,
                });
            },
        }),
    } satisfies BetterAuthClientPlugin;
};

// Re-export types
export * from "../types";
