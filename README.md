# Ember & Oak — Restaurant OS

A full restaurant management system: guests order and pay from their table, hosts and servers run the floor, the kitchen works from live tickets, and managers see sales and customer statistics. Members earn points and move up from **Member** to **Silver** and **Gold**.

Everything runs in Docker and is split into modules you can switch on or off per restaurant.

## What's inside

| For | Screen | What it does |
| --- | --- | --- |
| Guests | `/` | Book a table, see rewards tiers |
| Guests | `/t/<table-code>` | Menu from the table QR code, chef's specials, cart, order to kitchen, add more rounds |
| Guests | `/order/<id>` | Live order progress, tip, pay by phone (Stripe) |
| Guests | `/account` | Join rewards, membership card, points, order history |
| Host / Server | `/staff/floor` | Live floor plan coloured by table status, seat guests, take orders, take cash/card, today's bookings |
| Kitchen | `/staff/kitchen` | Ticket board: new → cooking → ready, tap dishes as they're done, late tickets highlighted |
| Manager | `/staff/manager` | Takings today, revenue trend, best sellers, busiest hours, payment mix, open orders |
| Manager | `/staff/manager/orders` | All orders with filters, refunds, takeaway orders |
| Manager | `/staff/manager/customers` | Customer stats, tier mix, revenue by tier, customer profiles, adjust tier/points |
| Manager / Kitchen | `/staff/manager/menu` | Dishes, sold-out switches, chef's specials (incl. Gold-only) |
| Manager | `/staff/manager/setup` | Tables + printable QR codes, tier rules, team accounts, enabled modules |

Every staff screen updates live over websockets.

## Run it

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
cp .env.example .env        # then set JWT_SECRET to a long random string
docker compose up --build
```

Open **http://localhost:8080**. On first start the database is created and a demo restaurant is loaded (menu, 12 tables, 24 customers and a month of order history).

**Demo staff logins** (password `password123`): `manager@demo.com`, `host@demo.com`, `server@demo.com`, `kitchen@demo.com`.
To try guest ordering, sign in as the manager, go to **Setup → Tables**, and open any table's QR code.

To start with an empty restaurant instead, set `SEED_DEMO_DATA=false` and `ADMIN_EMAIL` / `ADMIN_PASSWORD` for your first manager account.

## Payments

With no Stripe keys, payments run in **demo mode**: nothing is charged and the whole flow still works.

To take real card payments (including Apple Pay / Google Pay):

1. In your Stripe dashboard, copy your keys into `.env`: `STRIPE_SECRET_KEY` and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (start with `sk_test_` / `pk_test_`).
2. Add a webhook endpoint pointing to `https://your-domain/api/payments/webhook` for `payment_intent.succeeded` and `payment_intent.payment_failed`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`.
3. Rebuild: `docker compose up --build`.

Staff can also record **cash** and **card machine** payments from the floor. Managers can refund.

The payment code sits behind a `PaymentProvider` interface (`apps/api/src/modules/payments/payment-provider.ts`), so Square, Tyro or Adyen can be added without touching the rest of the app.

## Rewards tiers

| Tier | Reached at | Default perks |
| --- | --- | --- |
| Member | Sign-up | 1 point per $1 |
| Silver | 500 lifetime points | 5% off every order, 1.25× points |
| Gold | 1,500 lifetime points | 10% off every order, 1.5× points, Gold-only chef's specials |

100 points = $5 off. Thresholds, discounts, multipliers and perk text are editable in **Setup → Rewards**. Customers move up automatically after paying; managers can also set a tier by hand. Guests who leave an email are tracked too, and keep their history if they later sign up.

## Make it fit your restaurant

Switch modules with `ENABLED_MODULES` in `.env`:

```
tables,menu,specials,orders,payments,loyalty,reservations,stats,kitchen
```

A café might run `menu,orders,payments,kitchen`. Switched-off modules disappear from the staff navigation and their API routes return 404.

Tables, sections, shapes and floor positions, menu sections and dishes, specials, tiers and staff are all managed in the app. GST is included in prices by default (`TAX_INCLUSIVE=true`, `TAX_RATE=0.10`).

## Scaling

- The API is stateless. Run more copies with `docker compose up --scale api=3`; nginx spreads requests across them and Redis keeps live updates in sync between them.
- Postgres holds all data; point `DATABASE_URL` at a managed database (RDS, Cloud SQL, Neon) for production.
- Each service has its own Dockerfile, so the same images deploy to Kubernetes, ECS or Fly.io.

## Project layout

```
apps/
  api/                    NestJS + Prisma (Postgres)
    prisma/schema.prisma  data model
    src/modules/
      auth/ staff/ customers/
      tables/ reservations/
      menu/ specials/
      orders/             orders + kitchen tickets
      payments/           Stripe + simulated provider, cash/card, refunds
      loyalty/            points, tiers, discounts
      stats/              dashboards
      realtime/           socket.io gateway (+ Redis adapter)
    src/seed.ts           tier rules, first admin, demo data
  web/                    Next.js 15 + Tailwind
    app/                  guest pages and /staff screens
infra/nginx.conf          single entry point on :8080
docker-compose.yml
```

## Developing without Docker

```bash
# API (needs Postgres; Redis optional)
cd apps/api && npm install
export DATABASE_URL=postgresql://user:pass@localhost:5432/restaurant JWT_SECRET=dev
npx prisma db push && npm run build && npm run db:seed && npm start

# Web
cd apps/web && npm install
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000 npm run dev   # http://localhost:3000
```

## Before going live

- Set a long random `JWT_SECRET` and a strong Postgres password.
- Put the gateway behind HTTPS (a load balancer, Caddy, or Cloudflare).
- Switch Stripe to live keys only after testing with test keys.
- The schema is applied with `prisma db push`. For production change management, switch to `prisma migrate`.
