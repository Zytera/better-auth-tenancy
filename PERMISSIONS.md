# Sistema de Permisos y Roles Personalizado Hospitalario

Este documento describe el sistema de permisos y roles personalizados implementado para la gestión organizacional de hospitales.

## Arquitectura del Sistema

### Jerarquía Organizacional Hospitalaria

El sistema está diseñado para reflejar la estructura jerárquica real de un hospital con **3 niveles de permisos**:

#### Nivel 1: Hospital (Organization)
- Representa el hospital completo
- Los usuarios pueden tener scopes/grupos de permisos a nivel de toda la organización
- Ejemplo: Administrador Hospital, Director Médico
- Tabla: `organization` y `member` (con scopes asignados)

#### Nivel 2: Servicio (Team)
- Representa servicios médicos como Cardiología, Urología, Anestesia, Enfermería, etc.
- Los usuarios pueden tener **diferentes scopes/grupos en cada servicio**
- Ejemplo: Un usuario puede ser `service.admin` en Cardiología pero solo `service.viewer` en Urología
- Tabla: `team` y `teamMember` (con scopes asignados)

#### Nivel 3: Unidad Médica (MedicalUnit)
- Representa subespecialidades dentro de cada servicio
- Los usuarios pueden tener **diferentes scopes/grupos en cada unidad médica**
- Ejemplo: Un usuario puede ser `unit.admin` en UCI Cardiológica pero solo `unit.editor` en Hemodinámica
- Tabla: `medicalUnit` y `medicalUnitMember` (con scopes asignados)

**Ejemplos de Unidades Médicas por Servicio:**
- **Cardiología**: UCI Cardiológica, Hemodinámica, Electrofisiología
- **Urología**: Litotripsia, Oncología Urológica, Endourología
- **Anestesia**: Quirófano, UCI, Dolor
- **Enfermería**: Medicina Interna, Cirugía, Urgencias

### Asignación de Permisos Multi-Nivel

Un mismo usuario puede tener diferentes permisos en cada nivel:

**Ejemplo: Dr. López**
- **Hospital General**: `hospital.viewer` (puede ver reportes generales)
- **Servicio de Cardiología**: `service.admin` (administra todo el servicio)
  - **UCI Cardiológica**: `unit.admin` (control total de la unidad)
  - **Hemodinámica**: `unit.editor` (puede gestionar pero no otorgar permisos)
  - **Electrofisiología**: Sin acceso
- **Servicio de Urología**: Sin acceso

Esta estructura permite una **granularidad extrema** donde los permisos son **independientes en cada nivel** (organización, servicio, unidad médica).

### Estructura de Permisos Hospitalarios (Scopes)

Los permisos están organizados en grupos de scopes siguiendo la nomenclatura `[recurso].[acción]`:

#### 1. Scopes Personales
- `personal.holidays.manage`: Añadir y gestionar vacaciones, festivos y ausencias
- `personal.schedule.manage`: Gestionar horario personal y disponibilidad
- `personal.tasks.read`: Ver tareas asignadas y responsabilidades

#### 2. Scopes de Unidad 
- `unit.members.read`: Ver miembros de la unidad
- `unit.members.write`: Añadir y eliminar miembros de la unidad
- `unit.tasks.assign`: Asignar tareas específicas a miembros de la unidad
- `unit.schedules.manage`: Organizar horarios y turnos de la unidad
- `unit.permissions.grant`: Otorgar permisos adicionales a miembros de la unidad
- `unit.reports.read`: Ver reportes y métricas de la unidad

#### 3. Scopes de Servicio 
- `service.units.manage`: Crear, eliminar y gestionar unidades dentro del servicio
- `service.members.read`: Ver personal de todas las unidades del servicio
- `service.members.write`: Gestionar personal de todas las unidades del servicio
- `service.tasks.assign`: Asignar tareas en cualquier unidad del servicio
- `service.schedules.manage`: Coordinar horarios de todo el servicio
- `service.permissions.grant`: Otorgar permisos de servicio y unidad
- `service.reports.read`: Ver reportes completos del servicio

#### 4. Scopes de Hospital
- `hospital.services.manage`: Crear y gestionar servicios médicos
- `hospital.members.manage`: Gestionar todo el personal del hospital
- `hospital.reports.read`: Acceso a todos los reportes y analytics
- `hospital.settings.manage`: Configurar ajustes globales del sistema

#### 5. Scopes Especiales
- `residents.tasks.assign`: Asignar tareas específicamente a residentes
- `residents.supervise`: Supervisar y evaluar residentes

## Grupos de Scopes (Roles Predefinidos)

Los grupos de scopes agrupan múltiples scopes granulares en conjuntos coherentes, similares a "BigQuery Editor" en GCloud. Estos grupos facilitan la asignación de permisos.

### Nivel Personal
- **`personal.basic`**
  - Scopes incluidos: `personal.holidays.manage`, `personal.schedule.manage`, `personal.tasks.read`
  - Descripción: Permisos básicos para todos los usuarios del hospital

### Nivel Unidad
- **`unit.viewer`**
  - Scopes incluidos: `unit.members.read`, `unit.reports.read`
  - Descripción: Solo lectura de información de la unidad

- **`unit.editor`**
  - Scopes incluidos: `unit.viewer` + `unit.members.write`, `unit.tasks.assign`, `unit.schedules.manage`
  - Descripción: Gestión completa de la unidad sin otorgar permisos

- **`unit.admin`**
  - Scopes incluidos: `unit.editor` + `unit.permissions.grant`
  - Descripción: Control total de la unidad incluyendo gestión de permisos

### Nivel Servicio
- **`service.viewer`**
  - Scopes incluidos: `service.members.read`, `service.reports.read`
  - Descripción: Solo lectura de información del servicio

- **`service.editor`**
  - Scopes incluidos: `service.viewer` + `service.members.write`, `service.tasks.assign`, `service.schedules.manage`, `service.units.manage`
  - Descripción: Gestión completa del servicio sin otorgar permisos

- **`service.admin`**
  - Scopes incluidos: `service.editor` + `service.permissions.grant`
  - Descripción: Control total del servicio incluyendo gestión de permisos

### Nivel Hospital
- **`hospital.viewer`**
  - Scopes incluidos: `hospital.reports.read`
  - Descripción: Solo lectura de reportes del hospital

- **`hospital.admin`**
  - Scopes incluidos: `hospital.services.manage`, `hospital.members.manage`, `hospital.reports.read`, `hospital.settings.manage`
  - Descripción: Control total sobre la organización hospitalaria

### Tutor de Residentes
- **`residents.tutor`**
  - Scopes incluidos: `residents.tasks.assign`, `residents.supervise`
  - Descripción: Permisos para tutores de residentes

## Mapeo de Roles Hospitalarios a Grupos de Scopes

### Nivel Hospital (Organización)
- **Administrador Hospital**: `hospital.admin` + `service.admin` + `unit.admin` + `residents.tutor` + `personal.basic`
- **Director Médico**: `hospital.viewer` + `service.viewer` + `unit.viewer` + `personal.basic`

### Nivel Servicio (Departamento Médico)
- **Jefe de Servicio**: `service.admin` + `unit.admin` + `residents.tutor` + `personal.basic`
- **Coordinador Médico**: `service.editor` + `unit.viewer` + `personal.basic`

### Nivel Unidad/Equipo (Subespecialidad)
- **Jefe de Unidad**: `unit.admin` + `personal.basic`
- **Tutor de Residentes**: `unit.viewer` + `residents.tutor` + `personal.basic`
- **Médico Adjunto/Senior**: `unit.viewer` + `personal.basic`
- **Residente**: `personal.basic`
- **Personal de Enfermería**: `unit.viewer` + `personal.basic`

## Soporte Multiidioma

El sistema debe soportar multiidioma para:

### Scopes Granulares
- Nombres de scopes (ej: `personal.holidays.manage`)
- Descripciones de scopes

### Grupos de Scopes
- Nombres de grupos (ej: `unit.admin`, `service.editor`)
- Descripciones de grupos

### Roles Hospitalarios
- Nombres de roles (ej: "Administrador Hospital", "Jefe de Servicio")
- Descripciones de roles
