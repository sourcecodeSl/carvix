# Authentication

The platform uses opaque server-side sessions rather than JWTs. A 256-bit random token is returned only in an HttpOnly cookie. PostgreSQL stores SHA-256 of the token, never the raw token.

Passwords use Argon2id with a unique salt managed by the argon2 library. Password hashes are stored in `password_credentials` and excluded from public user responses.

The login flow:

1. Normalize and validate email and password.
2. Look up the user and password credential.
3. Reject inactive, disabled, deleted, or credential-less users.
4. Verify Argon2id password.
5. Check active tenant memberships.
6. Create a persisted session.
7. Set an HttpOnly cookie.

Logout revokes only the presented session and clears the cookie. Session expiration and revocation are enforced by `AuthGuard`.

```mermaid
sequenceDiagram
    participant Browser
    participant Next as Next.js
    participant API as NestJS
    participant Prisma
    participant PG as PostgreSQL

    Browser->>Next: Open /login
    Browser->>API: POST /api/v1/auth/login
    API->>Prisma: Verify credential and active membership
    Prisma->>PG: Read user and membership
    PG-->>API: Authorized account state
    API->>PG: Create hashed-token session
    API-->>Browser: HttpOnly secure session cookie
    Browser->>API: Authenticated request
    API->>Prisma: Validate session and membership
    Prisma->>PG: Transaction-local tenant context
    PG-->>API: RLS-filtered tenant data
```
