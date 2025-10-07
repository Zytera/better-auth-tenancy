// ============================================================================
// TYPES FOR PERMISSIONS PLUGIN
// ============================================================================

// Context for permission checks
export type PermissionContext =
    | { type: 'organization'; organizationId: string }
    | { type: 'team'; teamId: string }
    | { type: 'medicalUnit'; medicalUnitId: string };

// Permission expression for logical evaluation
export type PermissionExpression =
    | { and: string[] }  // All scopes must be present
    | { or: string[] };  // At least one scope must be present

// Scope definition
export interface Scope {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

// Scope group definition
export interface ScopeGroup {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

// Medical unit definition
export interface MedicalUnit {
    id: string;
    name: string;
    teamId: string;
    metadata?: string;
    createdAt: Date;
    updatedAt: Date;
}

// Translation interfaces
export interface ScopeTranslation {
    scopeId: string;
    language: string;
    name: string;
    description?: string;
}

export interface ScopeGroupTranslation {
    scopeGroupId: string;
    language: string;
    name: string;
    description?: string;
}