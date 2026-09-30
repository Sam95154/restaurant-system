# Sam's Cafe — Restaurant Management & Self-Ordering System

A working full-stack scaffold implementing the multi-branch restaurant
management + staff ordering + kitchen management + customer self-ordering
system, matching the master spec. **Customers never pay through the app** —
they place the order, eat, and pay staff directly; staff record the payment.

This was generated in a sandboxed environment with no live Postgres
database and no outbound access to Prisma's binary CDN, so it could not be
run/deployed from that environment. Both `backend` and `frontend` **do**
type-check cleanly and the frontend has a verified production build. To run
it for real, follow the steps below on a machine (or CI) with normal
internet access.

## What's implemented

**Backend** (Node/Express/TypeScript/Prisma/PostgreSQL/Socket.IO):
- Full schema for every table in the spec (branches, employees, RBAC
  permissions, customers, categories, items + images, tables, table
  sessions, orders + order items + status history, coupons + usage,
  bills + bill items, payments, reviews, notifications, audit logs).
- Employee login (bcrypt + JWT) and passwordless customer OTP login
  (`OtpService` abstraction — swap the mock provider for a real SMS/WhatsApp
  API in `src/services/otp.service.ts` without touching any caller).
- RBAC middleware (`requireRole`, `requireBranchAccess`) applied on every
  protected route — never just hidden in the UI.
- Branch, employee, category, item (+ image URL), table, and table-session
  management.
- Staff orders and customer self-orders, both going through one
  `createOrder()` that **recalculates price, discount, and total on the
  server** from the database — the client only ever sends `{itemId, quantity}`
  and a coupon code.
- Enforced order status state machine (`PENDING → ACCEPTED → PREPARING →
  READY → SERVED → COMPLETED`, or `CANCELLED`), with a status-history log.
- Kitchen feed, live Socket.IO events per branch/employee/customer room
  (`order.created`, `order.ready`, ...), and a notification record on top.
- Table-session billing: `POST /bills/generate` combines every served,
  unbilled order for a session into one bill.
- **Staff-only** payment recording (`POST /payments/record`) — there is no
  customer-facing payment endpoint anywhere in this codebase. Paying a bill
  in full closes the table session and frees the table.
- Coupon validation fully server-side (min order, expiry, usage limits,
  per-customer limits, branch eligibility).
- Reviews restricted to the order's own customer, only after it's served.
- Reports (dashboard counts, sales, item popularity) scoped by branch for
  managers, unscoped for Super Admin. Audit log of sensitive actions.

**Frontend** (React/TypeScript/Vite/Tailwind/React Query/Socket.IO client):
- Employee login + customer OTP login, both wired to the real API.
- A working **Kitchen Board** (Kanban, live-updating over the socket).
- A working **Admin Dashboard** pulling real numbers from `/reports/dashboard`.
- A working **Customer self-order flow**: pick branch → pick table → browse
  categories/menu → cart → coupon → place order (no payment step, on
  purpose) → live order tracking.
- Route guard (`ProtectedRoute`) — again, UX only; the API is the real gate.

## What's intentionally not built out yet

This is a scaffold, not the full 40+ screen product. Not yet wired on the
frontend: branch/employee/item/table/coupon CRUD screens, the service-
employee order-taking UI, billing/payment-recording UI, reviews moderation,
full reports/audit-log screens, image upload UI (the backend endpoint for
attaching an image URL exists; there's no Cloudinary upload widget yet).
The backend API for all of these already exists (see the route list below)
— it's realistic frontend work to build out from here, not backend work.

## Project structure

```
restaurant-system/
├── backend/            Express + TypeScript API
│   ├── prisma/schema.prisma   full DB schema
│   ├── prisma/seed.ts         seed data + demo logins
│   └── src/
│       ├── routes/            one file per resource
│       ├── middleware/        auth.ts (JWT), rbac.ts
│       ├── services/          otp, pricing/coupon, notifications, audit
│       └── sockets/           Socket.IO room wiring
├── frontend/           React + Vite + Tailwind app
│   └── src/{pages,contexts,api,routes,types}
└── docs/
```

## Running it locally

Prerequisites: Node 18+, a PostgreSQL database (local, Docker, or a free
tier like Neon/Supabase/Railway).

```bash
# 1. Backend
cd backend
cp .env.example .env        # then edit DATABASE_URL, JWT_SECRET
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed          # creates 2 branches, all 5 roles, menu, tables, WELCOME10
npm run dev                 # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000/api
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (printed again by the seed script):

| Role            | Login ID  | Password       |
|-----------------|-----------|----------------|
| Super Admin     | admin     | Admin@12345    |
| Manager         | manager1  | Manager@12345  |
| Waiter          | waiter1   | Waiter@12345   |
| Kitchen         | kitchen1  | Kitchen@12345  |

Customer login: enter any phone/email on `/login` or `/order` — with
`OTP_PROVIDER=MOCK` (the default) the 4-digit code is printed to the
backend console **and** returned in the API response as `devCode`, which
the login page displays. Switch `OTP_PROVIDER` and fill in real credentials
in `.env` to use an actual SMS/WhatsApp provider in production; only
`src/services/otp.service.ts` needs to change.

## End-to-end scenario this supports

Admin creates a branch → creates a manager/waiter/kitchen employee →
assigns them to the branch → creates a menu item → manager creates a table
→ customer logs in with OTP → picks the branch and table → orders → kitchen
gets it in real time → accepts/prepares/marks ready → waiter is notified →
customer orders again (same table session) → manager generates the combined
final bill → **customer pays the staff, not the app** → staff records the
payment → bill is `PAID`, table session closes, table becomes `AVAILABLE`
→ customer reviews the order → admin sees it all in reports/audit logs.

## API surface (backend/src/routes)

`auth`, `branches` (+`/public` for the customer app), `employees`,
`categories`, `items` (+`/images`), `tables` (+`/sessions`), `orders`
(`/staff`, `/self`, `/kitchen`, `/:id/status`), `coupons` (+`/validate`),
`bills` (+`/generate`), `payments` (+`/record`), `reviews`, `reports`,
`notifications`, `audit-logs`.

## Deployment (once you're ready)

- **Frontend** → Vercel or Netlify (`npm run build`, serve `frontend/dist`).
- **Backend** → Railway, Render, or Fly.io (`npm run build && npm start`);
  set every variable from `backend/.env.example` in the host's dashboard.
- **Database** → managed Postgres (Railway/Render/Neon/Supabase). Run
  `npx prisma migrate deploy` against it once, then `npx prisma db seed`
  if you want the demo data.
- **Images** → create a Cloudinary account, fill in the `CLOUDINARY_*`
  vars, and add an upload step in the frontend that calls Cloudinary
  directly and posts the resulting URL to `POST /items/:id/images`.
- **OTP** → pick an SMS/WhatsApp provider (MSG91, Gupshup, Twilio, etc.),
  set `OTP_PROVIDER`/`OTP_API_KEY`/`OTP_API_SECRET`/`OTP_SERVICE_ID`, and
  implement the real `deliverCode()` branch in `otp.service.ts`.

## Notes on what's simplified vs the full spec

- Tax is calculated as ₹0 by default (`taxAmount` exists on every order/bill
  and is ready to wire up once you decide on a tax rate/structure).
- The employee-permission tables (`Permission`/`EmployeePermission`) exist
  in the schema but routes currently gate by `role` only; extending
  `requireRole` to also check granular permissions is a small follow-up.
- No automated test suite yet (spec section 49/70) — the type-checks and
  build above are the verification that was possible in this environment;
  add Jest/Vitest + Supertest for real request-level tests next.
