# Role-Based Access Control (RBAC) Implementation Log

This document provides a comprehensive technical breakdown of the RBAC system designed and implemented for the **AI Political Poster Maker Backend**. It covers the architecture, data models, seeding workflows, middleware design, and database verification queries.

---

## 1. High-Level Architecture Overview

The system implements a granular, decoupled **Role-Based Access Control (RBAC)** model. Rather than hardcoding fixed role strings onto individual endpoints, permissions are treated as granular capability keys and assigned to roles. Users are assigned one or more roles, creating an extensible many-to-many relationship.

### Permission Flow
```
User
 │
 ├──▶ UserRole (Join Table)
       │
       └──▶ Role (e.g. SUPER_ADMIN, ADMIN, TEMPLATE_MANAGER, USER)
             │
             └──▶ RolePermission (Join Table)
                   │
                   └──▶ Permission (e.g. "category:create", "template:publish")
```

### Architectural Benefits:
1. **Separation of Concerns**: Endpoints check for specific capability keys (e.g., `template:publish`) rather than broad roles.
2. **Dynamic Permission Groups**: Roles can be reconfigured or expanded in the database without altering controller or route code.
3. **Multi-Role Support**: A user can hold multiple roles simultaneously through the `UserRole` junction table.
4. **Super Admin Bypass**: Top-tier administrative accounts (`SUPER_ADMIN`) possess global access across all system resources.

---

## 2. Modified & Created Files Breakdown

### A. Seed Script: `src/seed/seedRbac.ts`

The seed script initializes system permissions, default roles, and role-to-permission mappings in an idempotent and safe manner.

#### 1. Idempotency & Transaction Safety
- Uses `prisma.$transaction` with dedicated timeouts (`maxWait: 10_000ms`, `timeout: 30_000ms`) to guarantee atomic execution.
- Employs Prisma `upsert` operations:
  - `tx.permission.upsert({ where: { key } })` ensures existing permissions are not duplicated.
  - `tx.role.upsert({ where: { name } })` keeps role descriptions updated without recreation.
  - `tx.rolePermission.upsert({ where: { roleId_permissionId } })` avoids duplicate permission assignments.

#### 2. Addition of `admin:users:manage`
- **Why**: Administrative user management required an explicit permission key distinct from read-only auditing (`admin:users:read`) or changing user roles (`admin:users:role:update`).
- **Key**: `admin:users:manage`
- **Description**: *"Manage user accounts and statuses"*
- **Assigned Roles**:
  - `SUPER_ADMIN`: Automatically inherits this key via `permissions.map(...)`.
  - `ADMIN`: Explicitly added to its `permissionKeys` array.

#### 3. Sharmin's Account Role Assignment
- **Target Email**: `"itzsharmin07@gmail.com".toLowerCase()` (guarantees case-insensitive consistency).
- **Lookup Logic**:
  ```typescript
  const targetEmail = "itzsharmin07@gmail.com".toLowerCase();
  const user = await tx.user.findUnique({
    where: { email: targetEmail },
    select: { id: true },
  });
  ```
- **Composite Unique Key Upsert**:
  The `UserRole` model utilizes a compound primary key `@@id([userId, roleId])`. In Prisma, compound unique where queries use the generated identifier `userId_roleId`:
  ```typescript
  await tx.userRole.upsert({
    where: {
      userId_roleId: {
        userId: user.id,
        roleId: superAdminRole.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      roleId: superAdminRole.id,
    },
  });
  ```
- **Graceful Execution**:
  If the target user account has not yet registered in the database, the script catches this safely and logs:
  `User itzsharmin07@gmail.com not found, skipped role assignment`
  The transaction completes successfully without throwing an error.

---

### B. Authorization Middleware: `src/middlewares/permission.middleware.ts`

This middleware acts as the route guard that validates whether an authenticated user possesses the specific permission required to execute an endpoint.

#### Step-by-Step Execution Lifecycle of `requirePermission`:

```
Incoming Request
      │
      ▼
1. Extract User from req.user
      │
      ├── Missing/Invalid ID ────────────▶ 401 Unauthorized ("Authentication required")
      │
      ▼
2. Fetch User's Roles & Permissions via Prisma
      │
      ├── Has "SUPER_ADMIN" Role? ──────▶ Immediate Bypass (next())
      │
      ▼
3. Check Aggregated Permissions Set
      │
      ├── Required Key Present? ────────▶ Allow Request (next())
      │
      └── Required Key Missing ─────────▶ 403 Forbidden ("Insufficient permissions")
```

#### Step Breakdown:
1. **Extract Identity**: Reads `req.user.id` (set by the preceding `verifyToken` middleware). If the user is unauthenticated, returns HTTP `401 Unauthorized`.
2. **Database Traversal Query**:
   Queries `UserRole` with nested relations:
   ```typescript
   const userRoles = await prisma.userRole.findMany({
     where: { userId: req.user.id },
     include: {
       role: {
         include: {
           permissions: {
             include: {
               permission: true,
             },
           },
         },
       },
     },
   });
   ```
3. **SUPER_ADMIN Bypass**:
   If any assigned role matches `name === "SUPER_ADMIN"`, authorization is immediately granted via `next()`.
4. **Key Verification**:
   Extracts all active permission keys associated with the user's roles into a `Set<string>`. If `permissionsSet.has(requiredKey)` is true, execution proceeds to the controller.
5. **Rejection**:
   If the permission is absent, an `ApiError(403, "Access denied: required permission missing")` is thrown.

#### Error Code Semantics:
| Status Code | Meaning | Condition |
| :--- | :--- | :--- |
| **`401 Unauthorized`** | Identity unknown / unauthenticated | User token is missing, expired, or `req.user` is undefined |
| **`403 Forbidden`** | Identity known, access denied | User is authenticated, but lacks the necessary permission key |

---

## 3. Database Schema Mapping (Prisma)

The RBAC implementation maps across the following models defined in `prisma/models/rbac.prisma` and `prisma/models/identity.prisma`:

### 1. `Role`
Stores system and customizable roles.
- `id`: `String` (UUID, Primary Key)
- `name`: `String` (Unique, e.g., `"SUPER_ADMIN"`, `"ADMIN"`, `"TEMPLATE_MANAGER"`, `"USER"`)
- `description`: `String?`
- `isSystem`: `Boolean` (Protects core roles from accidental deletion)
- Relations: `users: UserRole[]`, `permissions: RolePermission[]`

### 2. `Permission`
Stores discrete system action keys.
- `id`: `String` (UUID, Primary Key)
- `key`: `String` (Unique, e.g., `"category:create"`, `"template:publish"`, `"admin:users:manage"`)
- `description`: `String?`
- Relations: `roles: RolePermission[]`

### 3. `RolePermission` (Junction Table)
Establishes the many-to-many relationship between `Role` and `Permission`.
- `roleId`: Foreign key to `Role.id` (`onDelete: Cascade`)
- `permissionId`: Foreign key to `Permission.id` (`onDelete: Cascade`)
- Compound Key: `@@id([roleId, permissionId])`
- Index: `@@index([permissionId])`

### 4. `UserRole` (Junction Table)
Establishes the many-to-many relationship between `User` and `Role`.
- `userId`: Foreign key to `User.id` (`onDelete: Cascade`)
- `roleId`: Foreign key to `Role.id` (`onDelete: Cascade`)
- Compound Key: `@@id([userId, roleId])`
- Index: `@@index([roleId])`

### 5. `User`
The user account identity model in `identity.prisma`.
- `id`: `String` (UUID, Primary Key)
- `email`: `String` (Unique)
- `roles`: `UserRole[]`

---

## 4. Verification & Testing Commands

### A. Running the RBAC Seed Script
To populate or update roles and permissions in the database:
```bash
npx tsx --env-file=.env src/seed/seedRbac.ts
```

*Expected output when user exists:*
```text
Assigned SUPER_ADMIN role to itzsharmin07@gmail.com
RBAC roles and permissions seeded successfully.
```

*Expected output when user is not yet created:*
```text
User itzsharmin07@gmail.com not found, skipped role assignment
RBAC roles and permissions seeded successfully.
```

---

### B. Database Inspection Queries (Neon SQL Console / pgAdmin)

#### 1. Inspect All Seeded Roles:
```sql
SELECT 
  id, 
  name, 
  description, 
  "isSystem", 
  "createdAt"
FROM "Role"
ORDER BY name ASC;
```

#### 2. Inspect All Defined Permissions:
```sql
SELECT 
  id, 
  key, 
  description
FROM "Permission"
ORDER BY key ASC;
```

#### 3. Inspect Permissions Mapped to Each Role:
```sql
SELECT 
  r.name AS role_name,
  p.key AS permission_key,
  p.description AS permission_description
FROM "Role" r
JOIN "RolePermission" rp ON r.id = rp."roleId"
JOIN "Permission" p ON rp."permissionId" = p.id
ORDER BY r.name ASC, p.key ASC;
```

#### 4. Verify Sharmin's User Role Assignment:
```sql
SELECT 
  u.id AS user_id,
  u.email,
  u.name,
  u.status,
  r.name AS assigned_role
FROM "User" u
JOIN "UserRole" ur ON u.id = ur."userId"
JOIN "Role" r ON ur."roleId" = r.id
WHERE LOWER(u.email) = 'itzsharmin07@gmail.com';
```

#### 5. Verify Permissions Effective for Sharmin's Account:
```sql
SELECT DISTINCT
  u.email,
  r.name AS via_role,
  p.key AS permission_key
FROM "User" u
JOIN "UserRole" ur ON u.id = ur."userId"
JOIN "Role" r ON ur."roleId" = r.id
JOIN "RolePermission" rp ON r.id = rp."roleId"
JOIN "Permission" p ON rp."permissionId" = p.id
WHERE LOWER(u.email) = 'itzsharmin07@gmail.com'
ORDER BY p.key ASC;
```

---

## 5. Steps 6, 7, and 8 Implementation Summary

### Step 6: `src/middlewares/permission.middleware.ts`
- **Auth Contract**: Validates `req.user` and `req.user.id`. If missing (or guest session without user), immediately responds with `401 Unauthorized` (`{ success: false, message: "Unauthorized" }`).
- **Lean Query Evaluation**: Fetches user's roles and permissions using Prisma `select: { role: { select: { name: true, permissions: { select: { permission: { select: { key: true } } } } } } }`.
- **Super Admin Bypass**: Immediate pass-through via `next()` if the user possesses `SUPER_ADMIN`.
- **Capability Check**: Grants access if user holds matching `requiredPermission`; otherwise responds with `403 Forbidden` (`{ success: false, message: "Forbidden: Insufficient permissions" }`).
- **Error Handling**: Passes unexpected database/execution errors to `next(error)`.

### Step 7: Category & Template Route Protection
- **Category Routes** (`src/modules/category/category.routes.ts`):
  - Protected management routes with `verifyToken + requirePermission`:
    - `POST /` (`category:create`)
    - `GET /admin/all` (`category:read:all`)
    - `PATCH /:id` (`category:update`)
    - `PATCH /:id/status` (`category:status:update`)
  - Public catalog route remains open: `GET /` (no auth required).
- **Template Routes** (`src/modules/template/template.routes.ts`):
  - Protected management routes with `verifyToken + requirePermission`:
    - `POST /` (`template:create`)
    - `PATCH /:id` (`template:update`)
    - `POST /:id/publish` (`template:publish`)
    - `POST /:id/archive` (`template:archive`)
    - `POST /:id/unarchive` (`template:unarchive`)
  - Public catalog routes remain open:
    - `GET /` (list published templates, public access)
    - `GET /:id` (`optionalAuth` for previewing drafts if authorized, otherwise public access)

### Step 8: Admin & RBAC Module Routes & Root Router Mounting
- **Admin Module** (`src/modules/admin/`):
  - `GET /api/v1/admin/users`: Paginated user list with role details and optional filtering (`page`, `limit`, `search`, `status`, `role`).
  - `GET /api/v1/admin/users/:id`: Detailed user inspection with roles.
  - `PATCH /api/v1/admin/users/:id/role`: Assign/reassign roles (`roleName`, `roleId`, `roleNames`, `roleIds`).
  - `PATCH /api/v1/admin/users/:id/status`: Update account status (`ACTIVE`, `BLOCKED`, `DELETED`).
  - Guard: All admin endpoints protected by `verifyToken + requirePermission("admin:users:manage")`.
- **RBAC Module** (`src/modules/rbac/`):
  - `GET /api/v1/rbac/roles`: List all system and custom roles with mapped permissions.
  - `POST /api/v1/rbac/roles`: Create custom roles.
  - `GET /api/v1/rbac/roles/:id`: Inspect single role and its permissions.
  - `PATCH /api/v1/rbac/roles/:id`: Update role metadata and permissions (protects system roles from name modification).
  - `DELETE /api/v1/rbac/roles/:id`: Delete custom role (protects system roles from deletion).
  - `GET /api/v1/rbac/permissions`: Inspect all available system capability permissions.
  - `POST /api/v1/rbac/roles/:id/permissions`: Assign permissions to a role.
  - `DELETE /api/v1/rbac/roles/:id/permissions`: Revoke permissions from a role.
  - Guard: All RBAC endpoints protected by `verifyToken + requirePermission("rbac:manage")`.
- **Root Router Mounting** (`src/routes/routes.ts`):
  - Mounted `router.use("/admin", adminRouter)` and `router.use("/rbac", rbacRouter)`.

