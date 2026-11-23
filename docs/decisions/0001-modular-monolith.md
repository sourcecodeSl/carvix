# 0001 — Use a modular monolith

Status: Accepted

Next.js provides server and browser application boundaries and a modern frontend platform. NestJS provides structured dependency injection and modular backend organization.

PostgreSQL is the internal source of truth. Prisma is used only for that PostgreSQL persistence. mysql2 is reserved for external MySQL inventory sources.

A modular monolith avoids premature network-service complexity while still separating backend modules and package boundaries. Redis and BullMQ are selected for future infrastructure, but BullMQ is not enabled on Day 1.

AI access will be implemented later through authorized backend tools. It will not receive database credentials or arbitrary SQL execution.
