# Session Management

Sessions are durable PostgreSQL records. Each record contains a unique token hash, user ID, optional active tenant ID, expiration, revocation state, creation time, and last-used time.

Development cookies are named `aicrm_session`. Production uses `__Host-aicrm_session` and requires Secure, Path=/, and no Domain attribute.

The default lifetime is 24 hours and is configurable through `SESSION_TTL_HOURS`. Invalid, expired, revoked, malformed, and suspended-user sessions fail authentication.

Expired-session cleanup and cross-instance revocation propagation may use scheduled BullMQ work in a later phase. Redis is currently used for login attempt limiting, not as the session authority.
