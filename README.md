# AI Political Poster Maker - Backend API

A RESTful backend service for generating and managing localized political campaign posters. The platform provides automated Bengali slogan generation, HTML-based poster template management, image processing and storage, an in-memory asynchronous job runner, credit and transaction ledgers, and SSLCommerz payment integration.

> **Notice**: This repository contains **backend services only**. Frontend client applications communicate with this service via REST endpoints over HTTP/JSON.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture & Project Structure](#architecture--project-structure)
- [Prerequisites](#prerequisites)
- [Installation & Local Setup](#installation--local-setup)
- [Environment Variables](#environment-variables)
- [Database Migrations & Seeding](#database-migrations--seeding)
- [Development & Production Commands](#development--production-commands)
- [API Endpoints Reference](#api-endpoints-reference)
- [Authentication, Sessions & RBAC](#authentication-sessions--rbac)
- [Service Flows & Pipelines](#service-flows--pipelines)
  - [Image Upload & Storage Flow](#image-upload--storage-flow)
  - [AI Slogan Generation & Task Flow](#ai-slogan-generation--task-flow)
  - [Poster Rendering Pipeline](#poster-rendering-pipeline)
  - [Billing & SSLCommerz Payment Flow](#billing--sslcommerz-payment-flow)
- [Security & Error Handling](#security--error-handling)
- [Current Limitations & Incomplete Areas](#current-limitations--incomplete-areas)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Identity & Session Management**:
  - Secure registration and login using JWT stored in `httpOnly` cookies or passed via `Authorization: Bearer` headers.
  - Anonymous guest session tokens allowing unauthenticated users to create drafts and upload assets.
  - Seamless guest-to-registered account transfer (posters, assets, and AI tasks are automatically claimed upon login).
- **Relational Role-Based Access Control (RBAC)**:
  - Granular database capability permissions assigned to roles (`SUPER_ADMIN`, `ADMIN`, `TEMPLATE_MANAGER`, `USER`).
  - Super admin/admin bypass logic and endpoint guards.
- **Template & Category Management**:
  - Categorized catalog of poster designs with customizable HTML layout configurations and field schemas.
  - Sanitize-html scrubbing of template HTML/CSS to strip arbitrary scripts and malicious URLs.
- **Image Processing & Secure Cloud Storage**:
  - Multer memory storage and magic-byte MIME validation (`image/jpeg`, `image/png`, `image/webp`).
  - Sharp image transformation (WebP conversion at quality 85, dimension checks up to 4000×4000, 512×512 avatar cropping).
  - Cloudinary authenticated/private asset storage with time-limited signed URLs (1-hour expiry).
  - Storage rollback: orphaned Cloudinary files are automatically purged if the database persistence step fails.
- **AI Text & Image Processing**:
  - Synchronous Bengali slogan creation via `@google/genai` (with fallback to `groq-sdk`).
  - Asynchronous background removal and image reshaping via Cloudinary transformations.
  - Automatic credit refund mechanism if billable AI tasks fail.
- **Billing, Wallets & Payments**:
  - Double-entry ledger architecture maintaining separate money wallets (`Wallet`) and credit wallets (`CreditWallet`).
  - SSLCommerz integration for digital recharges and package purchases.
  - Webhook (IPN) handlers and redirect endpoints for payment confirmation.
- **Background Maintenance**:
  - In-process maintenance cron job cleaning expired guest sessions and recovering timed-out AI tasks.

---

## Tech Stack

| Category | Technology / Package | Version | Usage / Notes |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js (ESM) | `>=20.x` | Native ESM (`"type": "module"` in `package.json`). |
| **Language** | TypeScript | `^5.7.0` | Target `ES2023`, module `NodeNext`, strict mode. |
| **Framework** | Express | `^5.3.0` | Core HTTP routing and middleware pipeline. |
| **Database** | PostgreSQL | `>=14.x` | Relational data store connected via `pg` (`^8.23.1`). |
| **ORM** | Prisma | `^7.10.1` | Multi-file schema with `@prisma/adapter-pg` driver adapter. |
| **File Uploads** | Multer | `^2.4.0` | In-memory multipart handling (10MB limit). |
| **Image Processing** | Sharp | `^0.35.5` | Resizing, metadata inspection, and WebP compression. |
| **MIME Validation** | file-type | `^22.2.0` | Binary magic-byte sniffing for upload validation. |
| **Cloud Storage** | Cloudinary SDK | `^2.11.0` | Authenticated image storage, signed URLs, deletion. |
| **AI Providers** | `@google/genai`<br>`groq-sdk` | `^2.30.0`<br>`^1.6.0` | Gemini (default: `gemini-3.8-flash`) and Groq (default: `qwen/qwen3.8-27b`). |
| **Payments** | Axios (custom client) | `^1.20.0` | HTTP requests to SSLCommerz API and validation server. |
| **Auth & Crypto** | `jsonwebtoken`<br>`bcryptjs` | `^9.0.3`<br>`^3.0.3` | HS256 JWT tokens; bcrypt password hashing (10–14 rounds). |
| **Validation** | Zod | `^4.6.7` | Request schema validation for payloads and query parameters. |
| **Sanitization** | sanitize-html | `^2.18.1` | HTML/CSS sanitization for poster template definitions. |

---

## Architecture & Project Structure

The project implements a modular, layered architecture under `src/`. Each domain resides in a dedicated module under `src/modules/<feature>` containing routes, controllers, services, and validation schemas.

```text
src/
├── config/                # Environment configurations (Cloudinary, CORS, DB)
├── cronJob/               # In-process scheduled maintenance jobs
├── generated/prisma/      # Auto-generated Prisma client
├── lib/                   # Shared Prisma client instance and HTML sanitizer
├── middlewares/           # Authentication, guest session, RBAC, upload guards
├── modules/               # Domain feature modules
│   ├── admin/             # System metrics, user listing, role & status updates
│   ├── ai/                # Prompt builders, Gemini/Groq providers, AI tasks
│   ├── auth/              # Registration, login, logout, guest transfer
│   ├── bookmark/          # User template bookmarking
│   ├── category/          # Poster template categories
│   ├── contact/           # Inbound contact inquiries
│   ├── guest/             # Guest session token generation
│   ├── package/           # Credit package catalog
│   ├── payment/           # SSLCommerz initiate, IPN webhook, redirect handlers
│   ├── poster/            # Poster CRUD, duplicate, and render trigger
│   ├── public/            # Public platform statistics
│   ├── rbac/              # Role and permission management
│   ├── subscription/      # User package subscriptions
│   ├── template/          # Poster template CRUD and publishing lifecycle
│   ├── transaction/       # User ledger and financial transaction history
│   ├── upload/            # Image validation, Sharp WebP processing, Cloudinary storage
│   ├── user/              # User profile, password management, account deletion
│   └── wallet/            # Money and credit wallet balances
├── routes/                # Central route aggregator mounting modules to /api/v1
├── seed/                  # Seeder scripts for RBAC, packages, and templates
├── services/storage/      # Cloudinary storage helper and signed URL generator
├── types/                 # Express request type declarations (user and guest context)
├── utils/                 # ApiError, asyncHandler, sendResponse, Prisma error helper
├── workers/               # In-memory polling loops for AI tasks and poster rendering
├── app.ts                 # Express app instance, global middlewares, 404 & error handlers
└── server.ts              # HTTP listener, database connection, queue initialization
```

---

## Prerequisites

- **Node.js**: `v20.0.0` or higher (Node 20+ required for native `--env-file` support).
- **PostgreSQL Database**: A running instance with credentials configured.
- **Cloudinary Account**: Cloud name, API key, and API secret.
- **Gemini or Groq API Key**: At least one key configured for AI slogan generation.
- **SSLCommerz Merchant Account**: Sandbox or live store ID and password (optional defaults exist for sandbox testing).

---

## Installation & Local Setup

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd ai-political-poster-maker-backend
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure environment variables**:
   Create a `.env` file in the project root based on the instructions below.

---

## Environment Variables

Copy the template below to `.env` in the root directory:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database Connection
DATABASE_URL="postgresql://postgres:password@localhost:5432/ai_poster_db?schema=public"

# Authentication & Security
# JWT_SECRET must be at least 32 bytes in length
JWT_SECRET="replace_with_a_secure_random_string_of_at_least_32_characters"
SALT_ROUNDS=12

# Client & Gateway URLs
CLIENT_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
BACKEND_URL="http://localhost:5000"

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME="your_cloudinary_cloud_name"
CLOUDINARY_API_KEY="your_cloudinary_api_key"
CLOUDINARY_API_SECRET="your_cloudinary_api_secret"

# AI Providers
GEMINI_API_KEY="your_google_gemini_api_key"
GEMINI_MODEL="gemini-3.8-flash"
GROQ_API_KEY="your_groq_api_key"
GROQ_MODEL="qwen/qwen3.8-27b"

# Payment Gateway (SSLCommerz)
SSLCOMMERZ_STORE_ID="your_store_id"
SSLCOMMERZ_STORE_PASSWORD="your_store_password"
SSLCOMMERZ_IS_LIVE="false"
```

### Environment Variable Requirements

| Variable | Required by Code | Default in Code | Purpose |
| :--- | :---: | :--- | :--- |
| `PORT` | No | `5000` | Express HTTP server port. |
| `NODE_ENV` | No | `development` | Logging level, stack trace visibility, cookie security. |
| `DATABASE_URL` | **Yes** | Fallback in `prisma.config.ts` | PostgreSQL connection string. |
| `JWT_SECRET` | **Yes** | None (throws error) | Signing key for tokens; must be `>= 32 bytes`. |
| `SALT_ROUNDS` | No | `12` | Bcrypt salt rounds (enforces between 10 and 14). |
| `CLIENT_URL` / `FRONTEND_URL` | **Yes** | None | Allowed CORS origins and payment redirect targets. |
| `BACKEND_URL` | **Yes** | None | Base domain for SSLCommerz callback and IPN URLs. |
| `CLOUDINARY_CLOUD_NAME` | **Yes** | None | Cloudinary storage account name. |
| `CLOUDINARY_API_KEY` | **Yes** | None | Cloudinary API access key. |
| `CLOUDINARY_API_SECRET` | **Yes** | None | Cloudinary API secret. |
| `GEMINI_API_KEY` | Feature-dependent | None | Key for Google GenAI SDK slogan generation. |
| `GEMINI_MODEL` | No | `"gemini-3.8-flash"` | Gemini model selection. |
| `GROQ_API_KEY` | Feature-dependent | None | Key for Groq SDK slogan generation fallback. |
| `GROQ_MODEL` | No | `"qwen/qwen3.8-27b"` | Groq model selection. |
| `SSLCOMMERZ_STORE_ID` | No | `"poste6ade7b12837f4"` | SSLCommerz store ID. |
| `SSLCOMMERZ_STORE_PASSWORD` | No | `"poste6ade7b12837f4@ssl"`| SSLCommerz store password. |
| `SSLCOMMERZ_IS_LIVE` | No | `'false'` | Toggle between sandbox and production gateway. |

---

## Database Migrations & Seeding

The database uses Prisma multi-file schemas configured under `prisma/models/`.

1. **Generate Prisma Client**:
   ```bash
   npx prisma generate
   ```

2. **Apply Existing Database Migrations**:
   ```bash
   npx prisma migrate deploy
   ```
   *(For development schema synchronization: `npx prisma migrate dev`)*

3. **Execute Seed Scripts**:
   The repository contains three seeder scripts that must be executed in order:

   ```bash
   # 1. Seed system permissions, default roles, and super admin assignments
   npx tsx --env-file=.env src/seed/seedRbac.ts

   # 2. Seed starter, campaign, and pro credit packages
   npx tsx --env-file=.env src/seed/seedPackages.ts

   # 3. Seed template categories and default poster templates (configured in package.json)
   npm run seed:templates
   ```

---

## Development & Production Commands

| Command | Action |
| :--- | :--- |
| `npm run dev` | Starts server with `tsx watch` using native `.env` loading. |
| `npm run build` | Generates the Prisma client and compiles TypeScript to `dist/`. |
| `npm start` | Launches compiled production server (`node dist/server.js`). |
| `npm run seed:templates` | Seeds default categories and templates into the database. |
| `npm run postinstall` | Runs `prisma generate` automatically after package installations. |

---

## API Endpoints Reference

All application endpoints are served under the `/api/v1` base route.

### 1. Authentication & User Profile
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | Register new user with optional avatar upload | Public |
| `POST` | `/api/v1/auth/login` | Login user, issue JWT cookie, claim guest session | Public |
| `POST` | `/api/v1/auth/logout` | Clear user session cookie | Authenticated |
| `GET` | `/api/v1/user/me` | Fetch active user profile, roles, and balance | Authenticated |
| `DELETE` | `/api/v1/user/me` | Soft delete user account | Authenticated |
| `POST` / `PATCH` | `/api/v1/user/profile` | Update profile information or avatar | Authenticated |
| `POST` / `PATCH` | `/api/v1/user/change-password` | Update account password | Authenticated |

### 2. Guest Sessions & File Uploads
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/guest/session` | Create new guest session token | Public |
| `POST` | `/api/v1/upload` | Upload image, compress to WebP, store in Cloudinary | User or Guest |
| `DELETE` | `/api/v1/upload/:id` | Remove asset from Cloudinary and mark deleted in DB | Asset Owner |

### 3. Poster Templates & Categories
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/template` | List published templates with filters | Public |
| `GET` | `/api/v1/template/:id` | Get single template details | Public (Optional Auth) |
| `POST` | `/api/v1/template` | Create a new template definition | `template:create` |
| `PATCH` | `/api/v1/template/:id` | Update template layout or fields | `template:update` |
| `POST` | `/api/v1/template/:id/publish` | Publish template to catalog | `template:publish` |
| `POST` | `/api/v1/template/:id/archive` | Archive an active template | `template:archive` |
| `POST` | `/api/v1/template/:id/unarchive` | Restore an archived template | `template:unarchive` |
| `DELETE` | `/api/v1/template/:id` | Delete/retire a template | `template:archive` |
| `GET` | `/api/v1/category` | List active categories | Public |
| `POST` | `/api/v1/category` | Create a new category | `category:create` |
| `GET` | `/api/v1/category/admin/all` | List all categories (active & inactive) | `category:read:all` |
| `PATCH` | `/api/v1/category/:id` | Update category details | `category:update` |
| `PATCH` | `/api/v1/category/:id/status` | Activate/deactivate category | `category:status:update` |
| `POST` | `/api/v1/bookmarks` | Bookmark a template | Authenticated |
| `GET` | `/api/v1/bookmarks` | List user's bookmarked templates | Authenticated |
| `DELETE` | `/api/v1/bookmarks/:templateId` | Remove bookmark | Authenticated |

### 4. Poster Lifecycle
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/posters` | Create new poster draft | User or Guest |
| `GET` | `/api/v1/posters` | List all posters owned by user/guest | User or Guest |
| `GET` | `/api/v1/posters/:id` | Get poster details and source assets | Owner Guard |
| `PATCH` | `/api/v1/posters/:id` | Update poster input data | Owner Guard |
| `DELETE` | `/api/v1/posters/:id` | Soft delete poster | Owner Guard |
| `POST` | `/api/v1/posters/:id/duplicate` | Clone existing poster | Owner Guard |
| `POST` | `/api/v1/posters/:id/render` | Debit credit and enqueue background render job | Owner Guard |
| `GET` | `/api/v1/posters/:id/status` | Check rendering status (`PENDING`, `COMPLETED`, etc.) | Owner Guard |

### 5. AI Services
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/ai/generate-slogans` | Synchronous Bengali slogan generation | User or Guest |
| `POST` | `/api/v1/ai/tasks` | Enqueue background AI task | User or Guest |
| `POST` | `/api/v1/ai/remove-background` | Enqueue background image removal task | User or Guest |
| `GET` | `/api/v1/ai/tasks/:id` | Check AI task status and output results | Task Owner Guard |

### 6. Billing, Packages & SSLCommerz Payments
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/packages` | List all active credit/subscription packages | Public |
| `POST` | `/api/v1/packages` | Create new credit package | `package:create` / Admin |
| `POST` | `/api/v1/payments` | Initiate payment session | Authenticated |
| `POST` | `/api/v1/payments/initiate` | Alternate path to initiate payment session | Authenticated |
| `POST` | `/api/v1/payments/webhook/:provider` | Universal payment webhook listener | Gateway / Public |
| `POST` | `/api/v1/payments/webhook/sslcommerz` | Dedicated SSLCommerz IPN webhook | Gateway / Public |
| `ALL` | `/api/v1/payments/sslcommerz/success` | Gateway redirect on success | Gateway Callback |
| `ALL` | `/api/v1/payments/sslcommerz/fail` | Gateway redirect on failure | Gateway Callback |
| `ALL` | `/api/v1/payments/sslcommerz/cancel` | Gateway redirect on cancellation | Gateway Callback |
| `GET` | `/api/v1/wallets/balance` | Get user money and credit balances | Authenticated |
| `GET` | `/api/v1/wallets/transactions` | Get wallet ledger history | Authenticated |
| `GET` | `/api/v1/transactions/my-history` | Get credit and payment transaction history | Authenticated |
| `GET` | `/api/v1/subscriptions/me` | Fetch active user subscription | Authenticated |
| `GET` | `/api/v1/subscriptions/history` | List subscription history | Authenticated |

### 7. Administration & Role Management
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/analytics/overview` | Platform-wide counts (users, posters, tasks) | `admin:users:manage` |
| `GET` | `/api/v1/admin/posters` | View all platform posters | `admin:users:manage` |
| `GET` | `/api/v1/admin/transactions` | System-wide transaction ledger entries | `admin:users:manage` |
| `GET` | `/api/v1/admin/users` | List all registered user accounts | `admin:users:manage` |
| `GET` | `/api/v1/admin/users/:id` | View specific user account details | `admin:users:manage` |
| `PATCH` | `/api/v1/admin/users/:id/role` | Update user assigned role | `admin:users:manage` |
| `PATCH` | `/api/v1/admin/users/:id/status` | Update user status (`ACTIVE`, `BLOCKED`, `DELETED`) | `admin:users:manage` |
| `GET` | `/api/v1/rbac/roles` | List all roles and assigned permissions | `rbac:manage` |
| `POST` | `/api/v1/rbac/roles` | Create new custom role | `rbac:manage` |
| `GET` | `/api/v1/rbac/roles/:id` | Get single role details | `rbac:manage` |
| `PATCH` | `/api/v1/rbac/roles/:id` | Update role metadata | `rbac:manage` |
| `DELETE` | `/api/v1/rbac/roles/:id` | Delete custom role | `rbac:manage` |
| `GET` | `/api/v1/rbac/permissions` | List all capability permissions | `rbac:manage` |
| `POST` | `/api/v1/rbac/roles/:id/permissions` | Attach permissions to role | `rbac:manage` |
| `DELETE` | `/api/v1/rbac/roles/:id/permissions` | Detach permissions from role | `rbac:manage` |

### 8. Public Utilities
| Method | Path | Purpose | Access Level |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/public/stats` | Aggregated user, template, and poster counts | Public |
| `POST` | `/api/v1/contact` | Submit contact/support message | Public |

---

## Authentication, Sessions & RBAC

### Dual Authentication
Authentication is supported through two mechanisms:
1. **Cookie-based**: Browser clients receive an `httpOnly`, `sameSite`-configured cookie named `token` expiring in 7 days.
2. **Bearer Header**: Mobile or API clients can pass tokens via `Authorization: Bearer <token>`.

### Anonymous Guest Sessions
Users can use the service without registration.
- An unauthenticated client calls `POST /api/v1/guest/session` to obtain an anonymous token.
- Tokens are passed via the `guest_session_id` cookie or `x-guest-session-id` header. The database stores only a SHA-256 hash of this token.
- The `requireUserOrGuest` middleware resolves the caller as either `req.user` or `req.guestSessionId`.
- **Automatic Claiming**: When a user registers or logs in with an active guest cookie, `claimGuestSessionForUser()` re-assigns all associated posters, assets, and AI tasks to the user's permanent account.

### Relational RBAC Implementation
Roles and permissions are not fixed enums; they are dynamic database records:
- `Role` has many `Permission` records via `RolePermission`.
- Users have many `Role` records via `UserRole`.
- **Default System Roles** (seeded by `seedRbac.ts`):
  - `SUPER_ADMIN`: Possesses all system permissions. Bypasses permission checks.
  - `ADMIN`: Possesses user management (`admin:users:manage`), all template permissions, and category permissions. Bypasses permission checks.
  - `TEMPLATE_MANAGER`: Possesses template creation, editing, publishing, and archiving permissions.
  - `USER`: Standard access with no administrative capability keys.
- **Permission Middleware** (`requirePermission`):
  - Checks if the user holds `SUPER_ADMIN` or `ADMIN` (immediate bypass).
  - Resolves required capability keys (including aliases `MANAGE_TEMPLATES` and `MANAGE_CATEGORIES`).
  - Returns `403 Forbidden` if capability keys are missing.

---

## Service Flows & Pipelines

### Image Upload & Storage Flow
```
Client (Multipart)
       │
       ▼
Multer (MemoryStorage, 10MB limit)
       │
       ▼
file-type (Magic byte validation: image/jpeg, image/png, image/webp)
       │
       ▼
Sharp Pipeline (Max 4000x4000 check -> WebP convert at 85% -> 1920x1080 fit)
       │
       ▼
Cloudinary Upload (Stream to 'political_posters_2' folder with type: authenticated)
       │
       ├── DB Error? ──▶ Purge file from Cloudinary (Rollback) & throw 500
       ▼
Prisma Asset Created (Linked to ownerUserId or guestSessionId)
```

### AI Slogan Generation & Task Flow
1. **Synchronous Slogan Generation**:
   - `POST /api/v1/ai/generate-slogans` invokes `aiService.generateSlogans`.
   - Sends Bengali campaign prompts to Gemini (`gemini-3.8-flash`) with an 8-second abort signal.
   - If Gemini is unconfigured or fails, it falls back to Groq (`qwen/qwen3.8-27b`).
   - Parses structured JSON response into slogan headlines and subtext.
2. **Asynchronous Tasks & Worker**:
   - Long-running jobs (`BACKGROUND_REMOVAL`, `IMAGE_RESHAPE`, `BACKGROUND_GENERATION`) are enqueued with status `PENDING`.
   - `aiTask.worker.ts` runs on an in-memory `setInterval` polling every 5 seconds.
   - Executes Cloudinary AI transformations or providers.
   - **Automatic Credit Refund**: If an error is categorized as non-retryable or reaches max retries, `refundAiTaskCreditsIfCharged()` credits the user's wallet via `BillingService.refundCredits`.

### Poster Rendering Pipeline
1. Client calls `POST /api/v1/posters/:id/render`.
2. Validates user credit balance (or guest poster limits). Debits credits under transaction key `POSTER_DEBIT`.
3. Marks poster status as `PROCESSING`.
4. `poster.worker.ts` polls every 5 seconds for pending/processing render jobs.
5. *(Current Implementation Note)*: The worker currently creates placeholder output assets in the database and updates poster status to `COMPLETED`. Headless browser canvas rendering is not yet integrated.

### Billing & SSLCommerz Payment Flow
1. Client calls `POST /api/v1/payments/initiate` specifying `packageId` or custom recharge amount.
2. `payment.service.ts` creates a `Payment` record with status `PENDING` and unique transaction ID (`tranId`).
3. `sslcommerz.adapter.ts` transmits session payload to SSLCommerz API (`/gwprocess/v4/api.php`).
4. SSLCommerz returns a `GatewayPageURL` redirect URL.
5. Upon user payment completion:
   - SSLCommerz calls IPN webhook (`/api/v1/payments/webhook/sslcommerz`) or redirect callbacks (`/sslcommerz/success`).
   - Payment status is verified against SSLCommerz validation API (`/validator/api/validationserverAPI.php`).
   - Upon verification (`VALIDATED` / `SUCCEEDED`), user's `Wallet` (money) or `CreditWallet` (poster credits) is atomically credited inside a database transaction.

---

## Security & Error Handling

- **IDOR / Ownership Protection**: Dedicated middleware ([`ownershipGuard.middleware.ts`](file:///d:/PROJECTS/Ai_political_poster_maker_backend/src/middlewares/ownershipGuard.middleware.ts)) and service-level checks guarantee that users and guests can only access, modify, or delete assets, posters, and AI tasks that match their verified identity context.
- **Input Sanitization**: All HTML and CSS inputs destined for poster templates are stripped of executable JavaScript, external protocol injections, and CSS `@import` attacks using `sanitize-html`.
- **Database Error Mapping**: Centralized wrapper `withPrismaErrorHandling` intercepts Prisma exceptions (such as `P2002` unique constraint violations) and converts them into structured HTTP `409 Conflict` responses without leaking internal schema paths.
- **Global Error Handling**: Centralized Express middleware ([`error.middleware.ts`](file:///d:/PROJECTS/Ai_political_poster_maker_backend/src/middlewares/error.middleware.ts)) formats error responses into consistent JSON objects, omitting stack traces in production environments (`NODE_ENV === "production"`).
- **Rate Limiting Guard**: In-memory IP sliding-window rate limiter ([`rateLimit.middleware.ts`](file:///d:/PROJECTS/Ai_political_poster_maker_backend/src/middlewares/rateLimit.middleware.ts)) available for protecting public endpoints against abusive bursts.

---

## Current Limitations & Incomplete Areas

- **In-Memory Background Queues**: Background tasks (`aiTask.worker.ts`, `poster.worker.ts`) and maintenance jobs (`cleanupExpiredSessions.job.ts`) use Node.js `setInterval` timers inside the Express server process. They are **not** distributed or persistent queues (e.g., BullMQ, Redis, RabbitMQ); server restarts will interrupt currently processing jobs.
- **Simulated Poster Rendering**: High-resolution poster rendering inside `src/workers/poster.worker.ts` currently orchestrates lifecycle states and generates simulated output asset records. The production hook for the headless browser (Puppeteer) or canvas rendering engine is stubbed and documented for deployment.

---

## Contributing

1. Fork the repository.
2. Create a dedicated feature branch (`git checkout -b feature/your-feature-name`).
3. Ensure TypeScript compiles without errors (`npm run build`).
4. Commit changes following conventional commit guidelines.
5. Push your branch and open a Pull Request.

---

## License

No license file is currently present in the repository. All rights reserved by the repository owners.

