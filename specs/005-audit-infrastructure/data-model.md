# Data Model: Audit Infrastructure (Spec 005)

## Enums

### `ChangeAction`
Enum representing the type of change operation performed on an entity.
- `CREATE`
- `UPDATE`
- `DELETE`

## New Models

### 1. AccessLog
Table name: `access_logs`
- **Tenant-scoped:** YES (has `tenantId`, but nullable for unauthenticated requests)
- **Append-only:** YES (no UPDATE/DELETE allowed)

#### Fields:
- `id`: String `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `method`: String (HTTP method: GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
- `route`: String (request path, e.g., `/api/tenants`)
- `statusCode`: Int `@map("status_code")`
- `ip`: String (client IP address)
- `userAgent`: String? `@map("user_agent")`
- `userId`: String? `@map("user_id") @db.Uuid` (nullable for public endpoints)
- `tenantId`: String? `@map("tenant_id") @db.Uuid` (nullable for unauthenticated)
- `requestId`: String `@map("request_id")` (correlation ID from pinoHttp)
- `durationMs`: Int `@map("duration_ms")`
- `timestamp`: DateTime `@default(now())`

#### Indexes:
- `@@index([tenantId, timestamp(sort: Desc)])` -- primary query pattern
- `@@index([requestId])` -- correlation lookup
- `@@index([userId, timestamp(sort: Desc)])` -- user activity lookup

#### Relations:
- `user`: User? `@relation(fields: [userId], references: [id])`
- `tenant`: Tenant? `@relation(fields: [tenantId], references: [id])`

### 2. ChangeRecord
Table name: `change_records`
- **Tenant-scoped:** YES (has `tenantId`)
- **Append-only:** YES (no UPDATE/DELETE allowed)

#### Fields:
- `id`: String `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid`
- `entityType`: String `@map("entity_type")` (Prisma model name, e.g., 'TenantUser')
- `entityId`: String `@map("entity_id") @db.Uuid`
- `action`: ChangeAction enum (CREATE, UPDATE, DELETE)
- `oldValue`: Json? `@map("old_value")` (full entity snapshot, sensitive fields redacted)
- `newValue`: Json? `@map("new_value")` (full entity snapshot, sensitive fields redacted)
- `actorId`: String? `@map("actor_id") @db.Uuid`
- `tenantId`: String? `@map("tenant_id") @db.Uuid`
- `requestId`: String `@map("request_id")`
- `timestamp`: DateTime `@default(now())`

#### Indexes:
- `@@index([tenantId, entityType, entityId])` -- entity history lookup
- `@@index([requestId])` -- correlation lookup
- `@@index([tenantId, timestamp(sort: Desc)])` -- chronological audit trail

#### Relations:
- `actor`: User? `@relation(fields: [actorId], references: [id])`
- `tenant`: Tenant? `@relation(fields: [tenantId], references: [id])`

## Modifications to Existing Models

### 1. Permission Model
Add missing audit fields:
- `createdById`: String? `@map("created_by_id") @db.Uuid`
- `updatedById`: String? `@map("updated_by_id") @db.Uuid`
- `deletedById`: String? `@map("deleted_by_id") @db.Uuid`
- `isActive`: Boolean `@default(true) @map("is_active")`

**Relations:**
- Add relations to `User` for each audit FK (`createdById`, `updatedById`, `deletedById`).

### 2. RoleAssignment Model
Add missing audit fields:
- `createdById`: String? `@map("created_by_id") @db.Uuid`
- `updatedById`: String? `@map("updated_by_id") @db.Uuid`
- `deletedById`: String? `@map("deleted_by_id") @db.Uuid`

**Relations:**
- Add relations to `User` for each audit FK (`createdById`, `updatedById`, `deletedById`).
*(Note: `assignedById` stays for business semantics, it's separate from audit)*

## Validation Rules
- **AccessLog:** `method` is one of GET/POST/PUT/DELETE/PATCH/OPTIONS/HEAD
- **AccessLog:** `statusCode` between 100-599
- **ChangeRecord:** `entityType` is non-empty string
- **ChangeRecord:** `action` is one of `ChangeAction` enum values
- **Both models:** No update or delete operations allowed (append-only)

## State Transitions
- **AccessLog:** None (immutable, single state)
- **ChangeRecord:** None (immutable, single state)
- **Domain entities:** Physical delete -> Soft delete (`is_active`: true -> false)
