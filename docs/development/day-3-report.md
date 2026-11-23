# Day 3 Report

Day 3 implemented server-side authentication and tenant authorization foundations.

## Implemented

- PasswordCredential and AuthSession Prisma models
- Argon2id password hashing
- Login, logout, `/auth/me`, and active tenant selection
- HttpOnly session cookie
- Authentication and permission guards
- Active membership and tenant status checks
- Origin-based mutation protection
- Redis-backed login attempt limiting
- Next.js login and protected dashboard routes
- Development-only user provisioning CLI

## Live verification

Verified against PostgreSQL and the running NestJS API:

- Valid login returned HTTP 200 and a safe current-user response.
- `/auth/me` returned HTTP 200 with the cookie.
- Logout returned HTTP 200.
- `/auth/me` then returned HTTP 401.
- Cross-origin mutation was rejected with HTTP 403.
- Repeated invalid login attempts returned HTTP 429 after the configured limit.
- The development cookie was HttpOnly, used SameSite=Lax, and had an explicit expiration.
