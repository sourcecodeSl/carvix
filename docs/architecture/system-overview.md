# System overview

The initial deployment is a modular monolith: one Next.js frontend and one NestJS backend share a monorepo but remain independently deployable. PostgreSQL is the authoritative internal database. Redis is infrastructure for connectivity and future caching or queues.

External dealership inventory remains MySQL-only. A dedicated package defines read-only contracts and normalized vehicle fields; no connection or synchronization implementation exists on Day 1.
