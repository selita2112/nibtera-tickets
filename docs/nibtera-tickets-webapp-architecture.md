NibTera Tickets — Web App System Architecture Overview
=======================================================

Overview
--------
This document describes the system architecture for the NibTera Tickets Web Application (the Web App). It focuses exclusively on the web-based administrative and public-facing experience — event management, ticketing, user administration, check-in and reporting — and omits all payment-gateway and mobile MiniApp payment lifecycle details.

1. System Architecture
----------------------
The Web App is built as a distributed, stateless application using Next.js (App Router) and React Server Components where appropriate. It provides two main audiences:
- Public Users: Browse events and reserve or claim tickets (non-payment flows managed by the Web App).
- Admins & Organizers: Dashboard for event creation, user and role management, reporting, and operational tasks.

1.1 Presentation Layer (Frontend)
---------------------------------
- Framework: React with Next.js App Router (file-system routing).
- Component Library: ShadCN UI (Radix primitives + Tailwind CSS) for accessibility and consistent theming.
- Rendering Strategy: Hybrid rendering using React Server Components (RSC) by default; `"use client"` for interactive components.
- UX Notes: Progressive enhancement for key flows (event browsing, ticket reservation, admin tasks). Accessible markup, keyboard navigation, and WCAG-compliant patterns are enforced across components.

1.2 Application Layer (Backend)
-------------------------------
- Server Platform: Next.js Server Actions and API Routes. Server Actions are used for form submissions and direct server-side business logic; API Routes are used for webhooks, integrations, and public API endpoints.
- Core Business Logic: Centralized in `src/lib/actions.ts` and supporting modules in `src/lib/`. All state-changing operations (create/update/delete) go through these server-side functions to ensure consistent validation, authorization, and logging.
- Background Jobs: Non-blocking tasks (email dispatch, CSV exports, report generation, cache warmups) are handled by background workers or scheduled jobs. These can run as separate processes or serverless functions.

1.3 Data Layer
--------------
- Database: PostgreSQL for relational, transactional data.
- ORM: Prisma for type-safe DB access, migrations (in `prisma/migrations`), and seeding (`prisma/seed.ts`).
- Primary Data Stores (examples):
  - `Users` (accounts, roles, contact info)
  - `Events` (metadata, schedules, venue info)
  - `TicketTypes` (name, price placeholder, total, sold)
  - `Tickets` / `Attendees` (owner, QR code, check-in status)
  - `Roles` and `Permissions` (RBAC)
  - `PromoCodes` and `Reservations` (optional reservation records for pending claims)
- Indexing & Search: Full-text or external search indexing (e.g., Postgres full-text, or an indexer like Elasticsearch/Typesense) for event listing and keyword search.

1.4 Security Layer
------------------
- Authentication: JWT-based authentication stored in secure, HTTP-only cookies. Session state is stateless and verified on each request.
- Authorization: Relational RBAC stored in the database (`Roles`, `Permissions`, `RolePermission`). Server-side checks enforce permissions for all Server Actions and API Routes.
- CSRF: Double-Submit Cookie pattern for state-changing requests (POST/PUT/DELETE).
- Rate Limiting: API rate limiting at the edge or application level to protect public endpoints.
- Input Validation: Zod schemas used both client-side and server-side for consistent validation.
- Secrets Management: Environment variables (e.g., `DATABASE_URL`, JWT keys) are stored securely and rotated per infra best-practices.

1.5 Deployment & Infrastructure
-------------------------------
- Build: `next.config.js` uses `output: "standalone"` to produce a minimal standalone Node.js server in `/.next/standalone` for production deployments.
- Hosting: Stateless application servers behind a load balancer; PostgreSQL hosted in a private subnet/database service.
- Network Topology: Public Subnet (Load Balancer, WAF) + Private Subnet (App Servers, Database). Only necessary ports opened between LB and App Servers.
- Scalability: Because the app is stateless (JWT sessions), multiple instances can be horizontally scaled behind the load balancer.
- High Availability: Health checks and automatic failover configured in the load balancer and database (replicas/backups).

2. Data Flow Diagrams (DFD)
---------------------------
2.1 Level 1: Context Diagram
- Process: NibTera Tickets Web App (single process).
- External Entities:
  - Public User / Attendee
  - Authenticated User (Organizer/Admin)
  - Email Service (transactional emails)
  - Third-Party Integrations (analytics, SSO providers, external reporting)
- Key Data Flows (examples):
  - Public User -> Web App: `Event Browsing Request`, `Ticket Reservation Request`, `Registration Details`.
  - Web App -> Public User: `Public Event Data`, `Ticket Confirmation & QR Code` (for claimed tickets).
  - Authenticated User -> Web App: `Login Credentials`, `Management Actions`.
  - Web App -> Authenticated User: `Dashboard Data`, `Session Token` (cookie), `Check-in Results`.
  - Web App -> Email Service: `New User Email`, `Event Notifications`, `Reservation Confirmations`.

2.2 Level 2: High-Level Diagram
- Processes:
  1. User & Event Management: Authentication, user lifecycle, event CRUD.
  2. Ticketing & Reservation: Ticket selection, reservation claims, promo code validation, waitlist.
  3. Attendee Check-in: QR code validation and offline check-in sync.
  4. Reporting & Exports: Sales reports, attendance reports, CSV/Excel exports.
- Data Store: PostgreSQL (see 1.3 for tables).
- Data Flows:
  - Authentication Flow: `Login Credentials` -> User Management -> DB -> `Session Token` cookie.
  - Event Management Flow: Event create/update -> DB write -> Dashboard reads.
  - Ticketing Flow: Selected tickets -> Reservation created -> DB -> `Ticket` assigned on confirmation.
  - Check-in Flow: QR scan -> Check-in process -> DB update -> Validation result.

2.3 Level 2: Detailed DFD (Example: Ticket Reservation & Check-in)
- Processes:
  - Browse & Claim: Public user selects tickets and claims them. If payment is handled outside the Web App, the system can still create reservations and mark tickets `CLAIMED` or `PENDING` for manual reconciliation.
  - Reservation Finalize: Admin or an automated background job finalizes reservations, issues tickets with QR codes, and notifies attendees.
  - Check-in: Organizer scans QR; system validates ticket and records `checkedInAt` timestamp.
- Data Stores:
  - `TicketTypes` (inventory)
  - `Reservations` (temporary holds)
  - `Tickets` / `Attendees`
- Data Flows:
  1. User selects ticket(s) and submits claim.
  2. System creates a `Reservation` record (with TTL/expiry) and reduces available inventory for the session.
  3. Reservation is either confirmed (ticket issued) or expires and inventory is released.
  4. On confirmation, a `Ticket` record is created with a unique QR code; email notification is queued.
  5. At event entry, QR is scanned; check-in status is updated in DB.

3. Business Logic
-----------------
3.1 Business Rules & Workflows
- User Registration & Approval:
  1. New Organizer registers; account created as `INACTIVE`.
  2. Admin reviews and sets status to `ACTIVE` to allow event creation.
- Event Creation & Approval:
  1. Authenticated Organizer creates an event; `status` defaults to `PENDING`.
  2. Admin must `APPROVE` or `REJECT` the event. Only `APPROVED` events are public.
- Ticket Inventory & Reservations:
  1. `TicketType.total` and `TicketType.sold` manage inventory.
  2. Reservations hold stock temporarily to prevent overselling. TTLs and background sweeps release stale reservations.
  3. Final issuance marks the ticket `ISSUED` and increments `sold`.

3.2 Validation Logic
- Client-Side: Zod schemas for immediate feedback on forms (event creation, registration, reservation).
- Server-Side: All Server Actions validate input using the same Zod schemas; business checks (e.g., availability, organizer limits) are enforced server-side.
- Concurrency: DB transactions or SELECT ... FOR UPDATE are used when adjusting inventory to prevent oversell.

3.3 Configurable Business Rules (RBAC)
- Roles & Permissions: Admins can create `Roles` and assign granular `Permissions` through the Role Management UI. No code changes required to modify RBAC rules.
- Enforcement: `AuthGuard` components (frontend) and server-side permission checks prevent unauthorized UI elements and API executions.

3.4 Traceability & Auditing
- Centralized Actions: `src/lib/actions.ts` is the single place for state-changing operations, making it straightforward to add structured logs.
- Timestamps: All core tables include `createdAt` and `updatedAt` fields.
- Audit Logs: An `AuditLog` table captures who performed admin actions and what changed, with optional JSON diffs for record snapshots.

4. Additional Recommended Features (not in original doc)
--------------------------------------------------------
These features improve operational resilience, analytics, and admin productivity.

- Reporting & Analytics:
  - Real-time dashboard metrics (views, reservations, issued tickets, attendance).
  - Exportable reports (CSV/Excel) for finance and compliance.
  - Optional integration with analytics platforms (Segment, GA4) with opt-in data controls.

- Notifications & Communication:
  - Templated transactional emails for registration, reservation confirmation, and event reminders.
  - Optional SMS gateway integration for urgent notifications and reminders.
  - Notification preferences per user.

- Waitlist & Auto-Promote:
  - Allow users to join a waitlist when tickets are sold out; auto-promote waitlisted users when inventory becomes available.

- Bulk Operations & Imports:
  - CSV import for attendees and bulk ticket issuance.
  - Bulk-edit events or ticket types in the admin UI.

- Offline & Mobile Check-in Support:
  - Ability to download an offline CSV of valid QR codes for events with limited connectivity and later sync check-ins.
  - Mobile-friendly check-in UI for organizers.

- Multi-Venue & Seating Support:
  - Support for venues with multiple rooms and seat maps (general admission + assigned seating).

- Search & Discovery Improvements:
  - Tagging, categories, and topic-based filters.
  - Featured events and admin-controlled prioritization.

- Integrations & Extensibility:
  - Public REST API or GraphQL endpoints for third-party integrations (ticket verification, event listings).
  - Webhook support for non-payment events (reservation created, ticket issued, check-in events).

- Admin Productivity & Safety:
  - Feature flags for staged rollouts of new features.
  - Admin activity audit logs and role-scoped permissions.
  - Soft-delete and restore for core entities.

- Internationalization & Accessibility:
  - Locale support (dates, currency placeholders, translations).
  - WCAG 2.1 compliance for public-facing pages.

- Observability & Reliability:
  - Structured logging, request tracing, and health checks.
  - Metrics export (Prometheus/Datadog) for uptime and performance monitoring.

5. Operational Considerations
----------------------------
- Backups & Recovery: Regular DB backups, tested restore procedures, and point-in-time recovery where supported.
- Maintenance: Migration runbook for `prisma migrate` and downtime windows for schema changes where necessary.
- Security Reviews: Periodic audits, dependency scanning, and secrets rotation.

Appendix: Implementation Notes
------------------------------
- Centralize server-side business logic in `src/lib/actions.ts` to keep a single source of truth for validation, auditing, and permission checks.
- Use Zod schemas shared between client and server to prevent divergence.
- Prefer DB transactions for inventory-critical operations.
- Keep the Web App stateless; where stateful background work is required, use queued workers.

Document Location
-----------------
The updated architecture document has been saved to `docs/nibtera-tickets-webapp-architecture.md` in the repository.
