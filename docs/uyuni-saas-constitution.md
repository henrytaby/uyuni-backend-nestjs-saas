# Uyuni SaaS - Constitution

<!-- NOTA: Este archivo es una copia de referencia. La fuente canónica es .specify/memory/constitution.md -->

> **Documento maestro de la especificación técnica y funcional para Uyuni SaaS.**
> Este documento define **qué** construir y **cómo**, actuando como el núcleo de conocimiento para el desarrollo desde cero en NestJS.

---

## 1. Visión General del Producto

**Uyuni SaaS** es un **ERP-lite** B2B multi-tenant. 
*Nota Arquitectónica: Un ERP tradicional (como SAP u Odoo) abarca flujos inmensos (contabilidad completa, manufactura, nóminas complejas). Un "ERP-lite" se enfoca en el núcleo que realmente necesitan las PYMES (clientes, agenda, ventas/caja, y un inventario básico), eliminando la fricción y la curva de aprendizaje pesada.*

Está diseñado para ofrecer un **Core-CRM** genérico adaptable a múltiples nichos como clínicas, ferreterías, y empresas de servicios.

### 1.1. Pilares Funcionales
- **Multi-Tenancy Robusta**: Aislamiento total de datos por cuenta/cliente (Tenant).
- **Control de Acceso Avanzado**: RBAC granular basado en Módulos, Permisos CRUD y Scope.
- **Suscripciones y Planes**: Restricción de funcionalidades y límites operativos (ej. usuarios) basados en el Tier de pago.
- **Auditoría Completa**: Trazabilidad absoluta de accesos y modificaciones de datos (CDC).
- **Arquitectura Modular API-First**: Backend expuesto vía REST con documentación OpenAPI para consumo desde múltiples clientes.

---

## 2. Stack Tecnológico

El proyecto está diseñado para desplegarse en entornos tradicionales (ej. VPS con Nginx y PostgreSQL), utilizando repositorios separados para Backend y Frontend:

| Capa | Tecnología |
|---|---|
| **Lenguaje** | TypeScript 5.x estricto |
| **Framework Backend** | NestJS 11.x |
| **ORM** | Prisma 7.x |
| **Base de Datos** | PostgreSQL 16+ |
| **Frontend** | Angular 21.x (Repositorio separado) |
| **Validación** | `class-validator` + `class-transformer` |
| **Autenticación** | `@nestjs/jwt` + `passport-jwt` + `bcryptjs` |
| **Logging** | `pino` + `nestjs-pino` |
| **Testing** | Jest + supertest + Testcontainers |
| **Validación de Entorno** | Zod 4.x |

---

## 3. Arquitectura y Patrones (Clean Architecture)

El backend sigue estrictamente los principios **SOLID**, **DRY** y **KISS**, estructurado en capas (Clean Architecture):

- **Domain**: Entidades abstractas y modelos de negocio.
- **Application**: Casos de uso (Services), Interfaces/Puertos.
- **Infrastructure**: Implementaciones concretas de ORM (Prisma), Mailers, Loggers.
- **Presentation**: Controladores REST API, Interceptors, Guards, Exception Filters.

### 3.1. Estructura del Repositorio (Backend Standard NestJS)
Al ser un proyecto **Multi-repo** (el Backend y Frontend viven en repositorios de GitHub distintos), la estructura del backend sigue el estándar oficial de NestJS CLI:

```text
uyuni-backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── common/           # Decorators, Guards, Interceptors, Filters compartidos
│   ├── infrastructure/   # Prisma, Logger, Mailer
│   └── modules/          # Módulos de dominio (auth, tenancy, crm, sales, etc.)
├── prisma/
│   └── schema.prisma     # Definición de la base de datos y migraciones
├── test/                 # Tests e2e
└── package.json
```

### 3.2. El Contrato (Types) es Ley en Multi-repo
Al no usar un monorepo, no podemos importar directamente los archivos `.ts` (DTOs) en el frontend. Para mantener el principio de **"El Contrato es Ley"**, el estándar de la industria es utilizar **OpenAPI (Swagger)**:
1. NestJS genera automáticamente la documentación Swagger (`/api/docs`) basándose en los DTOs y Controladores.
2. El Frontend en Angular utiliza herramientas como `openapi-generator` o `ng-openapi-gen` para **autogenerar** sus interfaces TypeScript y servicios HTTP directamente desde el JSON de Swagger del backend.
3. Esto garantiza que si el Backend cambia un DTO, el Frontend se actualizará automáticamente en su siguiente compilación, evitando fallos de integración.

### 3.3. Repositorio Genérico y Paginación (DataTables)
El sistema incluye funcionalidades transversales para alimentar tablas de datos ricas en el frontend (ej. PrimeNG DataTables). 
En lugar de repetir código de paginación y filtrado en cada endpoint, se implementa un **Patrón de Repositorio Base Genérico** (e.g., `TenantScopedRepository<T>`) que encapsula:
- **Paginación, Ordenamiento y Conteo (DataTables)**: Soporte nativo para `limit`, `offset` (o `skip`/`take`), `sortField` y `sortOrder`. El repositorio ejecuta en paralelo la consulta de datos y la función `count()` para retornar un objeto estandarizado `{ data: T[], total: number }`, estrictamente necesario para que PrimeNG renderice los totales del paginador.
- **Búsqueda Global (Searchable Fields)**: El repositorio permite definir propiedades "searchable_fields" (ej. nombre, email, documento) y genera dinámicamente un bloque de consultas `OR` con sentencias `ilike`/`contains` utilizando Prisma, centralizando la lógica de búsqueda.
- **Aislamiento Multi-Tenant Automático**: El repositorio base inyecta obligatoriamente el `tenant_id` y valida el `scope_all` (RBAC) en cada consulta a la base de datos de manera transparente a través del contexto inyectado (`AsyncLocalStorage`). Esto asegura por diseño que ninguna paginación o consulta cruce datos de otros tenants, sin requerir código manual en los Controladores o Servicios.
- **Contrato DTO Único**: Se utiliza un DTO estandarizado (ej. `DataTableRequestDto`) expuesto en OpenAPI para todos los endpoints de listado, lo cual permite crear componentes reutilizables y limpios en el Frontend.

### 3.4. Desarrollo Autónomo y Enrutamiento Descentralizado
Para garantizar que múltiples desarrolladores puedan trabajar en paralelo sin generar conflictos de código (merge conflicts), la arquitectura adopta el modelo nativo de NestJS basado en **Decoradores y Módulos**, evitando la existencia de archivos centralizados o "diccionarios" de rutas globales.
- **Controladores Autónomos**: El enrutamiento se define directamente sobre la clase que maneja la lógica de presentación. Por ejemplo, al crear el dominio de ventas, simplemente se define un `SalesController` con el decorador `@Controller('sales')`. Las sub-rutas (ej. `@Get()`, `@Post()`) se establecen decorando los métodos en esa misma clase.
- **Agrupación por Módulos**: El controlador se registra exclusivamente en su propio módulo (ej. `SalesModule`), el cual se acopla de manera limpia en el árbol de dependencias principal (ej. `AppModule` o un módulo agrupador).
- **Desacoplamiento y Cero Conflictos**: Al no existir un archivo maestro de enrutamiento que todos los desarrolladores deban modificar constantemente, la autonomía del equipo es total. Cada nuevo dominio de negocio se crea como un *Feature Module* completamente independiente, conteniendo sus propios Controladores, Servicios y DTOs en una misma carpeta.

---

## 4. Funcionalidades Core del Sistema

### 4.1. Multi-Tenancy (B2B SaaS) y Planes
El núcleo del sistema permite alojar múltiples empresas en una única infraestructura.
- **Jerarquía**: 
  - `Plan`: Tiers de suscripción. Define límites cuantitativos (`max_usuarios`, `almacenamiento`) y **límites cualitativos** (acceso a ciertos módulos, ej. el plan "Free" no tiene acceso al módulo de "Logística avanzada").
  - `Tenant`: Cuenta de la empresa cliente. Rastrea su estado de pago y suscripción actual.
  - `User`: Persona física con login global por email.
  - `TenantUser`: Membresía que conecta un `User` a un `Tenant` con un Rol específico.
- **Seguridad y Aislamiento**: Uso estricto de `AsyncLocalStorage` y extensiones de Prisma para inyectar automáticamente el `tenant_id` en todas las consultas y escrituras, apoyado como capa secundaria por PostgreSQL RLS. Todo endpoint de dominio está protegido por un `TenantGuard`.

### 4.2. Autenticación (Auth)
- **Login por Email**: Identificación global única por correo (sin usernames).
- **JWT Robusto**: Tokens de acceso de corta duración combinados con Refresh Tokens.
- **Rotación y Blacklist**: Cada uso de refresh token invalida el anterior en la base de datos.
- **Seguridad Defensiva**: Lockout automático tras 5 intentos fallidos (prevención de fuerza bruta).
- **Cambio de Contexto**: Posibilidad de cambiar entre Tenants activos sin necesidad de volver a hacer login (`PUT /auth/tenant-context`).

### 4.3. Control de Acceso Basado en Roles (RBAC)
- **Roles y Membresías**: Los roles (`Admin`, `Empleado`, `Auditor`) son globales pero se asignan a nivel de Tenant.
- **Permisos por Módulo**: Los permisos están definidos de manera granular para cada módulo del sistema y acción (`CREATE`, `READ`, `UPDATE`, `DELETE`).
- **Scope (`scope_all`)**: Define si un usuario puede ver *todos* los registros del Tenant o *solo los propios* (creados por él).
- **Platform Admin Bypass**: Usuarios superadmin de la plataforma pueden saltar validaciones RBAC para dar soporte transversal.

### 4.4. Auditoría Integral (Audit)
- **Access Logs**: Interceptor que captura información de cada petición (método, ruta, status, IP, `user_id`, `tenant_id`).
- **Change Data Capture (CDC)**: Registro inmutable de modificaciones (`old_value` vs `new_value`, quién, cuándo).
- **Soft-Delete**: Todo borrado lógico se maneja a través del flag `is_active=false`.
- **Columnas de Auditoría (Created/Updated/Deleted)**: Manejo nativo e invisible. Prisma gestiona automáticamente `created_at` y `updated_at`. Para campos como `created_by_id`, `updated_by_id` y `deleted_by_id`, se utiliza una **Extensión de Prisma** que intercepta las operaciones `create` y `update` para inyectar automáticamente el ID del usuario directamente desde el `AsyncLocalStorage`. Ningún desarrollador necesita "acordarse" de pasar al usuario que realizó la acción; la arquitectura lo sella.

### 4.5. Catálogos Dinámicos (Catalogs)
- **Catalog Registry**: Sistema para listas de valores parametrizables por el Tenant (ej. categorías de clientes, estados de tareas).
- **Bulk Loader**: Endpoints optimizados (`POST /catalogs/bulk`) para poblar múltiples selectores del frontend en una única petición.

### 4.6. Módulos de Dominio (Núcleo ERP-Lite & CRM)
Para servir como un verdadero SaaS B2B genérico, el sistema abandona estructuras legacy corporativas y adopta los siguientes módulos estándar:

1. **SaaS Administration & Tenancy**: 
   - Gestión de suscripciones, upgrades/downgrades de Planes, estados de pago (activo, moroso, suspendido).
   - Gestión de usuarios, invitaciones al Tenant y asignación de roles.
2. **CRM Core (Clientes y Contactos)**: 
   - Gestión de Leads (Prospectos) y Cuentas/Clientes.
   - Directorio de contactos e historial de interacciones básicas.
3. **Agenda & Tareas (Productividad)**: 
   - Calendario de citas/reuniones (esencial para clínicas o servicios).
   - Gestión de tareas operativas y asignaciones entre el equipo del Tenant.
4. **Ventas y Facturación (Sales & Billing)**: 
   - Creación de cotizaciones/presupuestos.
   - Emisión de facturas o comprobantes de pago.
   - Registro básico de ingresos/egresos (Caja chica).
5. **Inventario Básico (Logistics - *Plan Pro/Premium*)**: 
   - Catálogo de productos/servicios.
   - Control de stock simple y gestión de activos fijos operativos.

### 4.7. Integraciones y Webhooks (Future-Proofing)
*(Concebido como "Nice to Have" para implementaciones futuras)*
- Arquitectura preparada para exponer Webhooks.
- Capacidad de importar/exportar datos masivos (CSVs de clientes o productos).
- Integración potencial con pasarelas de pago (Stripe, PayPal) para la automatización del cobro de las suscripciones de los Tenants.

---

## 5. Criterios de Calidad y Observabilidad

### 5.1. Observabilidad (SRE)
- **Logging Estructurado**: Todo log es JSON con contexto rastreable (`requestId`, `tenantId`, `userId`).
- **Health Checks**: Endpoints de Liveness y Readiness.
- **Métricas**: Preparado para exportar telemetría (OpenTelemetry).

### 5.2. Seguridad (DevSecOps)
- Validaciones estrictas de Input/Output en la frontera de la API.
- Rate Limiting por IP, Usuario y Tenant para prevenir abusos.
- CORS configurado de forma estricta (solo permitiendo el dominio del Frontend en producción) y protección por Helmet.

### 5.3. Testing y CI/CD
- **Testing Pyramid**: Tests unitarios en lógica de negocio y tests e2e para controladores.
- **E2E con Testcontainers**: Pruebas de base de datos real en un ambiente aislado durante CI.
- **Gates Anti-Fugas de Tenant**: Pruebas automatizadas críticas que aseguran que es matemáticamente imposible que un usuario del Tenant A acceda a datos del Tenant B.

---

## 6. Estado de Implementación

> Última actualización: 2026-07-23

| # | Módulo | Estado | Spec |
|---|--------|:------:|------|
| 001 | Foundation & Bootstrap | ✅ Implementado | `specs/001` |
| 002 | Multi-Tenancy Core | ✅ Implementado | `specs/002` |
| 003 | Authentication | ✅ Implementado | `specs/003` |
| 004 | RBAC | ✅ Implementado | `specs/004` |
| 005 | Audit Infrastructure | 📋 Especificado | `specs/005` |
| 006 | Generic Repository & DataTables | 📋 Especificado | `specs/006` |
| 007 | Dynamic Catalogs | 📋 Especificado | `specs/007` |
| 008 | SaaS Administration | 📋 Especificado | `specs/008` |
| 009 | CRM Core | 📋 Especificado | `specs/009` |
| 010 | Agenda & Tasks | 📋 Especificado | `specs/010` |
| 011 | Sales & Billing | 📋 Especificado | `specs/011` |
| 012 | Basic Inventory | 📋 Especificado | `specs/012` |
