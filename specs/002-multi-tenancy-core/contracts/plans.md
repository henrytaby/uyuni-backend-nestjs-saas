# API Contract: Plans

**Module**: Tenancy
**Base Path**: `/tenancy/plans`
**Auth**: Platform admin only (JWT + platform-admin guard)
**Plan Gate**: N/A (Plans are platform-global management)

Plans are subscription tier definitions. They are platform-global: no
tenant scope. Managed by platform superadmins.

---

## POST /tenancy/plans

Create a new plan tier.

**RBAC**: Platform admin (`is_platform_admin = true`)

**Request Body**:

```json
{
  "name": "Pro",
  "tierLevel": 2,
  "maxUsers": 25,
  "storageLimit": 10737418240,
  "moduleAccess": ["auth", "tenancy", "crm", "agenda", "sales", "inventory"],
  "price": 49.99
}
```

| Field        | Type     | Required | Validation                                                                                                                                                                                 |
| ------------ | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| name         | string   | yes      | 1-50 chars, unique                                                                                                                                                                         |
| tierLevel    | number   | yes      | integer 1-10                                                                                                                                                                               |
| maxUsers     | number   | yes      | > 0                                                                                                                                                                                        |
| storageLimit | number   | yes      | >= 0 (bytes); accepted as JSON number, stored as Prisma `BigInt`. _Note: Serialized back via `Number()` — values > 2^53 (~9 PB) lose precision. No string overload planned at this scale._ |
| moduleAccess | string[] | yes      | array of module names                                                                                                                                                                      |
| price        | number   | no       | >= 0                                                                                                                                                                                       |

**Response** (201 Created):

```json
{
  "id": "uuid",
  "name": "Pro",
  "tierLevel": 2,
  "maxUsers": 25,
  "storageLimit": 10737418240,
  "moduleAccess": ["auth", "tenancy", "crm", "agenda", "sales", "inventory"],
  "price": 49.99,
  "isActive": true,
  "createdAt": "2026-07-07T12:00:00Z",
  "updatedAt": "2026-07-07T12:00:00Z"
}
```

**Errors**:

- 400: Validation error (invalid name, duplicate, bad module list)
- 403: Not a platform admin

---

## GET /tenancy/plans

List all plans.

**RBAC**: Platform admin

**Response** (200 OK):

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "Free",
      "tierLevel": 1,
      "maxUsers": 3,
      "moduleAccess": ["auth", "tenancy", "crm", "agenda"],
      "isActive": true
    },
    {
      "id": "uuid",
      "name": "Pro",
      "tierLevel": 2,
      "maxUsers": 25,
      "moduleAccess": [
        "auth",
        "tenancy",
        "crm",
        "agenda",
        "sales",
        "inventory"
      ],
      "isActive": true
    }
  ],
  "total": 2
}
```

_(Divergence Note: Spec 002 returns `{ data, total }` based on early design. Spec 006 standardizes all list endpoints to `{ data, meta }`. This discrepancy is accepted for 002 and will be migrated in 006)._

---

## GET /tenancy/plans/:id

Get a single plan.

**RBAC**: Platform admin

**Response** (200 OK): Full plan object.

**Errors**:

- 404: Plan not found

---

## PATCH /tenancy/plans/:id

Update a plan. Cannot reduce `maxUsers` below the count of users in any
tenant on this plan (would orphan memberships) — use spec 008 downgrade
flow for that.

**RBAC**: Platform admin

**Response** (200 OK): Updated plan object.

**Errors**:

- 409: `maxUsers` would be below current member count of one or more tenants

---

## DELETE /tenancy/plans/:id

Soft-delete a plan (sets is_active=false). Rejected if any tenant is
currently on this plan.

**RBAC**: Platform admin

**Errors**:

- 409: Plan is in use by one or more tenants
