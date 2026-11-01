# Technical Handover Report: Architecture, Authentication, RBAC & Next.js 16 Optimization

**Project:** Political Poster Maker (Full-Stack Monorepo)  
**Repositories:** `Ai_political_poster_maker_backend` (Express, Prisma, TypeScript) & `Ai_political_poster_Frontend` (Next.js 16, React 19, Turbopack, Tailwind CSS)  
**Date:** November 1, 2026  
**Audience:** Incoming Engineering Team / Technical Maintainers  

---

## 1. Executive Summary & Architecture Overview

This project has completed a full-stack architectural overhaul designed to eliminate third-party vendor lock-in, streamline authentication, establish an enterprise-grade Many-to-Many RBAC (Role-Based Access Control) system with dynamic credit bypass, and resolve Next.js 16 Turbopack SSR/PPR compatibility hurdles.

### Core Architectural Pillars
1. **Deprecation of Firebase Authentication & Admin SDK:**
   - Completely eliminated the Firebase client SDK and Firebase Admin SDK.
   - Replaced with native Google Identity Services (Google OAuth 2.0) powered by `google-auth-library` on the backend and `@react-oauth/google` on the frontend.
   - Standardized on self-issued, cryptographically signed JSON Web Tokens (JWT) stored in environment-aware `HttpOnly` cookies.
2. **Dynamic Many-to-Many RBAC & Credit Bypass Engine:**
   - Transitioned from rigid, hardcoded single-role checks (`SUPER_ADMIN`) to dynamic Many-to-Many Prisma relational lookups (`User` ↔ `UserRole` ↔ `Role` ↔ `RolePermission` ↔ `Permission`).
   - Privileged accounts (`SUPER_ADMIN`, `ADMIN`, or custom roles possessing bypass permissions such as `UNLIMITED_CREDITS`, `BYPASS_CREDIT_CHECK`, `POSTER_CREATE_FREE`, `CREDITS:BYPASS`, or `PREMIUM_ACCESS_BYPASS`) automatically bypass credit balance checks, template locks, watermarking, and wallet deductions across all backend render pipelines and frontend UI guards.
3. **Next.js 16 (Turbopack) PPR & Instant Navigation Compliance:**
   - Resolved Turbopack instant navigation segment validation errors on dynamic dashboard routes (`/admin`) using `export const instant = false;` and `<Suspense>` boundary skeletons.
   - Eliminated hanging promise rejections (`HANGING_PROMISE_REJECTION`) during static prerendering on the homepage by migrating from uncached server-side fetches (`cache: "no-store"`) to Incremental Static Regeneration (`next: { revalidate: 60 }`).

```mermaid
flowchart TD
    subgraph Frontend ["Frontend (Next.js 16 / React 19)"]
        UI["Login / Register / Workspace UI"]
        GIS["@react-oauth/google (useGoogleLogin)"]
        AxiosInst["Axios (withCredentials: true)"]
        AuthCtx["AuthContext (permissions, canBypassCredits)"]
    end

    subgraph Backend ["Backend (Node.js / Express / Prisma)"]
        AuthRoute["POST /api/v1/auth/google"]
        GoogleAuthLib["google-auth-library (OAuth2Client)"]
        PrismaM2M["Prisma RBAC Query (User -> UserRole -> Role -> RolePermission -> Permission)"]
        JWT["JWT Cookie Issuer (HttpOnly, SameSite, Secure)"]
        AuthMiddleware["verifyToken / optionalAuth"]
        PosterService["poster.service.ts (Credit Check / Bypass)"]
        TemplateService["template.service.ts (isPrivilegedTemplateUser)"]
    end

    UI --> GIS
    GIS -->|OAuth Token| AxiosInst
    AxiosInst -->|POST withCredentials| AuthRoute
    AuthRoute --> GoogleAuthLib
    GoogleAuthLib --> PrismaM2M
    PrismaM2M --> JWT
    JWT -->|Set-Cookie: token| AxiosInst
    AxiosInst --> AuthCtx
    AuthCtx -->|Bypass Signals| UI
    PosterService -->|Check hasCreditBypass| PrismaM2M
    TemplateService -->|Check hasCreditBypass| PrismaM2M
```

---

## 2. Backend Changes (`Ai_political_poster_maker_backend`)

### 2.1 Dependencies
- **Added:** `google-auth-library` (`^9.x`) for server-side Google ID token and access token verification.
- **Removed:** `firebase-admin` and dead Firebase service account credentials.

### 2.2 Auth & Session Flow
- **Native Google Login Service (`src/modules/auth/auth.service.ts`):**
  - Implemented `googleLoginService(token: string)` with robust fallback mechanics:
    1. First attempts ID token verification via `OAuth2Client.verifyIdToken({ idToken: token, audience: process.env.GOOGLE_CLIENT_ID })`.
    2. If token verification fails because an OAuth2 access token was supplied, falls back to Google's standard userinfo endpoint: `https://www.googleapis.com/oauth2/v3/userinfo`.
    3. Validates that `payload.email_verified === true`.
    4. Performs an upsert / find-or-create operation on `prisma.user`:
       - If user exists: synchronizes profile name, avatar URL, and updates profile metadata.
       - If user is new: creates user with status `ACTIVE`, assigns default `USER` role via `prisma.userRole`, and initializes account credits.
    5. Issues a signed JWT containing `{ id, email, roles }`.
- **Dynamic Cookie Serialization:**
  - Hardcoded cookie properties were replaced by an environment-aware resolver:
    ```typescript
    const isProduction = process.env.NODE_ENV === "production";
    const isLocal = !isProduction || origins.includes("localhost") || origins.includes("127.0.0.1");

    export const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: !isLocal,
      sameSite: isLocal ? "lax" : "none",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    ```
  - Standardized across `auth.service.ts`, `guest.controller.ts`, and `user.controller.ts` (ensuring `res.clearCookie("token", { ...cookieOptions, path: "/" })` and `res.clearCookie("guest_session_id", { ...cookieOptions, path: "/" })` wipe sessions properly upon logout or account deletion).

### 2.3 RBAC & Many-to-Many Permission Unpacking
- **Middleware Layer (`src/middlewares/auth.middleware.ts`):**
  - Updated `verifyToken` and `optionalAuth` to query user roles along with their relational permissions:
    ```typescript
    roles: {
      select: {
        role: {
          select: {
            name: true,
            permissions: {
              select: {
                permission: { select: { key: true } },
              },
            },
          },
        },
      },
    }
    ```
  - Unpacks flat string arrays:
    - `req.user.roleNames: string[]`
    - `req.user.permissionKeys: string[]`
    - `req.user.hasCreditBypass: boolean` (Evaluates `true` if roles include `SUPER_ADMIN`, `ADMIN` or permissions include `UNLIMITED_CREDITS`, `BYPASS_CREDIT_CHECK`, `POSTER_CREATE_FREE`, or `CREDITS:BYPASS`).
- **Poster Rendering & Ledger Protection (`src/modules/poster/poster.service.ts` & `src/workers/poster.worker.ts`):**
  - In `triggerRender()`, credit balance check (`user.credits < 1`) and debit ledger creation (`POSTER_DEBIT`) are safely skipped if `user.hasCreditBypass === true`.
  - In `poster.worker.ts`, refund logic on job failure checks if a debit ledger entry (`reserve_${idempotencyKey}`) was actually registered before executing a refund. Privileged runs that never paid are not refunded phantom credits.
- **Template Access Bypass (`src/modules/template/template.service.ts`):**
  - In `isPrivilegedTemplateUser()`, checks both in-memory permissions and direct database relations for `MANAGE_TEMPLATES`, `UNLIMITED_CREDITS`, `BYPASS_CREDIT_CHECK`, `POSTER_CREATE_FREE`, and `PREMIUM_ACCESS_BYPASS`, granting privileged users unfettered access to unpublished or premium frames.

### 2.4 CORS & Request Sanitization
- In `src/config/cors.ts`:
  - Strips accidental enclosing single/double quotes from `FRONTEND_URL` and `CLIENT_URL` environment variables.
  - Whitelists localhost ports (`3000`, `3001`, `5173`) and production frontend domains.
  - Configures `credentials: true`.
  - Sets `exposedHeaders: ["Set-Cookie"]` and allows incoming `Cookie`, `X-Requested-With`, `Accept`, and `Content-Type` headers.

---

## 3. Frontend Changes (`Ai_political_poster_Frontend`)

### 3.1 Dependencies
- **Added:** `@react-oauth/google` (`^0.12.x`) for Google Identity Services OAuth 2.0 dialogs and credential handling.
- **Removed:** `firebase` package; completely removed legacy `src/lib/firebase.ts`.

### 3.2 Google Authentication & Post-Login Redirection
- **Root Provider (`src/components/providers/google-auth-provider.tsx` & `src/app/layout.tsx`):**
  - Wrapped root app layout with `<GoogleOAuthProvider clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""}>`.
- **Login Component (`src/modules/auth/client/login/login-form.tsx`):**
  - Uses `useGoogleLogin` with implicit flow to obtain OAuth credentials.
  - Sends payload `{ idToken: tokenResponse.access_token }` to `/api/v1/auth/google` with `{ withCredentials: true }`.
  - Performs intelligent dynamic role routing:
    - Users with `SUPER_ADMIN` or `ADMIN` roles → redirected to `/admin`.
    - Users with `TEMPLATE_MANAGER` role → redirected to `/admin/templates`.
    - Regular users → redirected to `returnUrl` or `/`.

### 3.3 Centralized Network Layer & Auth State
- **Axios Configuration (`src/lib/axios.ts`):**
  - Global `axios.defaults.withCredentials = true` configured on initialization and loaded at root layout.
  - All calls across `authApi.ts`, `recharge.service.ts`, `template.service.ts`, and poster generation share credentialed cookie transmission.
- **Auth Context (`src/context/AuthContext.tsx`):**
  - Extracted properties: `permissions: string[]`, `hasCreditBypass: boolean`, and `canBypassCredits: boolean`.
  - Provided downstream to all consumer components via `useAuth()`.

### 3.4 UI & Dynamic Credit Bypass Integration
- **Poster Generator Workspace (`src/modules/poster-generator/client/generator-workspace.tsx`):**
  - Connected to `useAuth()`.
  - Suppresses credit insufficiency blocks (`credits <= 0`), prevents triggering recharge modals for admins, and skips local balance decrement on render completion.
  - Renders visual badges:
    - Credits display: `"আনলিমিটেড (Unlimited)"` with infinite styling.
    - Premium frames: `"প্রো ফ্রেম (ফ্রি অ্যাক্সেস)"` for privileged accounts.
- **Poster Success Modal (`src/modules/poster-generator/client/poster-success-modal.tsx`):**
  - Prop `creditsLeft` upgraded to accept `number | string` (displaying `"আনলিমিটেড"` without rendering `NaN` or crashing).

### 3.5 Next.js 16 Turbopack Fixes & ISR Optimization
- **Dashboard Segment Instant Navigation Validation (`src/app/(dashboard)/admin/page.tsx`):**
  - Exported `export const instant = false;` to opt out the dynamic segment from instant prefetch validation in Turbopack.
  - Encapsulated asynchronous statistics and chart components inside `<Suspense>` boundaries with dedicated skeleton fallbacks (`StatsCardsSkeleton`, `ChartsSkeleton`).
- **Server Prerender Hanging Promise Fix (`src/modules/home/home.service.ts`):**
  - Migrated `getTrendingTemplates` from uncached `cache: "no-store"` to ISR `next: { revalidate: 60 }`.
  - Fixes build failures where dynamic root server fetches timed out during static page generation.

---

## 4. Configuration & Environment Variables Required

### 4.1 Backend (`Ai_political_poster_maker_backend/.env`)

```ini
# Database & Secrets
DATABASE_URL="postgresql://user:password@localhost:5432/poster_maker?schema=public"
JWT_SECRET="your-secure-jwt-secret-key"

# Native Google OAuth 2.0 (Replaces Firebase)
GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"

# Network & CORS
PORT=5000
NODE_ENV="development" # or "production"
FRONTEND_URL="http://localhost:3000"
CLIENT_URL="http://localhost:3000"
COOKIE_DOMAIN="localhost"

# Cloudinary & Third-party Services
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# Payment Gateway (SSLCommerz)
STORE_ID="your-store-id"
STORE_PASSWORD="your-store-password"
IS_LIVE="false"
```

> [!NOTE]
> **Deprecated/Removed Backend Variables:**  
> `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` are completely deleted and no longer required.

---

### 4.2 Frontend (`Ai_political_poster_Frontend/.env`)

```ini
# Backend API Base URL
NEXT_PUBLIC_SERVER_URL="http://localhost:5000"

# Google Identity Services (Client ID for @react-oauth/google)
NEXT_PUBLIC_GOOGLE_CLIENT_ID="your-google-oauth-client-id.apps.googleusercontent.com"
```

> [!NOTE]
> **Deprecated/Removed Frontend Variables:**  
> `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` are completely deleted.

---

## 5. Verification & Testing Status

| Area / Pipeline | Command / Methodology | Result | Status |
| :--- | :--- | :--- | :--- |
| **Backend Static Typecheck** | `node --max-old-space-size=2048 ./node_modules/typescript/bin/tsc --noEmit` | `Exit Code 0` (0 errors across all controllers, services, middlewares) | PASS |
| **Frontend Static Typecheck** | `node --max-old-space-size=4096 ./node_modules/typescript/bin/tsc --noEmit` | `Exit Code 0` (0 errors across components, context, services) | PASS |
| **Next.js 16 Production Build** | `npx next build` (Turbopack) | `28/28 routes` compiled and generated (Partial Prerendering + Static) in 1.1s | PASS |
| **Google Sign-In Flow** | Token verification at `/api/v1/auth/google` | ID token & Access token fallbacks succeed, session cookie set | PASS |
| **RBAC Credit Bypass** | Admin poster generation trigger | Bypasses credit checks, leaves user ledger untouched, generates poster | PASS |
| **Cookie Persistence** | Cross-origin credentialed requests | `HttpOnly` cookies persist and attach automatically via Axios instance | PASS |

---

## 6. Developer Onboarding Quickstart

### Starting Backend:
```bash
cd Ai_political_poster_maker_backend
npm install
npx prisma generate
npm run dev
```

### Starting Frontend:
```bash
cd Ai_political_poster_Frontend
npm install
npm run dev
```

*Frontend will run at `http://localhost:3000`, Backend at `http://localhost:5000`.*

