# Glamour Queue — Salon Queue Management System

**Live demo:** [https://salon-queue-rnam.onrender.com](https://salon-queue-rnam.onrender.com)  
**Hosted on:** Render Free + Supabase Free (PostgreSQL)  
**Admin Password:** M7rK-4vQp-9xT2-Lc8N-z5Ws
**Public source:** [GitHub repository](https://github.com/vedantpjoshi/salon-queue)  

---

## About

Glamour Queue is a real-time salon queue management system that lets customers browse services, book appointments, and track their token status — while stylists manage their workflow on a live board and the waiting area TV shows the Now Serving display.

## Features

- 📱 **Service Menu** — Browse 20 salon services across Hair, Skin, Nails & Spa categories
- 🛒 **Cart & Booking** — Add services, enter details, get a token number
- 🔢 **Live Token Tracking** — Real-time status updates (Placed → In Progress → Completed)
- 🧍 **Queue Position & Wait Estimate** — Customers see how many people are ahead and a live service-duration estimate
- 💇 **Stylist Board** — 3-column Kanban board for stylists to manage the queue
- 📺 **Live Queue Display** — Waiting, In Progress, and Ready to Collect lanes update on the waiting-room screen
- 🔐 **Separate staff access** — Customers can browse and book without an account; the admin dashboard and stylist board require a protected sign-in
- ⚙️ **Admin Dashboard** — Manage services, toggle availability, view today's stats
- ⚡ **Real-Time Sync** — All screens update instantly via Socket.IO
- 📊 **Daily Token Reset** — Token numbers restart at 1 each day

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Backend | Express.js + Socket.IO |
| Database | Local SQLite (sql.js); hosted PostgreSQL (Supabase) |
| Icons | Lucide React |
| Deployment | Render |

## Screens

| Screen | URL | User |
|--------|-----|------|
| Services Menu | `/` | Customer |
| Cart | `/cart` | Customer |
| Token Status | `/token/:id` | Customer |
| Stylist Board | `/stylist` | Stylist / Staff |
| Now Serving | `/display` | TV / Waiting area |
| Admin Sign-in / Panel | `/admin` | Salon Owner |

## Run Locally

```bash
# Install dependencies
npm install

# Start development (frontend + backend concurrently)
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Build for Production

```bash
npm run build
npm start
```

## Free deployment

The included `render.yaml` selects Render's free web service. Set up a free Supabase project, then add its Postgres connection string as the `DATABASE_URL` secret in Render. Add a private `ADMIN_PASSWORD` value there too; Render generates a `SESSION_SECRET` when the Blueprint is created. The app creates its tables and seeds the menu when it starts, and validates the Supabase TLS certificate when connecting. In Render, connect this repository and deploy the Blueprint; if this project is inside a larger repository, set the service's **Root Directory** to `salon-queue`.

The app uses local SQLite during development when `DATABASE_URL` is not set. In production, it requires `DATABASE_URL` and refuses to start without it so orders are not silently written to temporary storage.

For local development, the admin password defaults to `salon123`; set `ADMIN_PASSWORD` and `SESSION_SECRET` in your local environment to override it. Never commit production credentials. Admin sessions expire after eight hours; sign out to end a session sooner.

This setup uses free plans only. Render's free backend can sleep when idle, and Supabase may pause a free database after a week of low activity. A paused Supabase database may need to be restored from its dashboard. Keep usage within each provider's free quotas; do not upgrade the services or enable paid add-ons.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/services` | List all services |
| POST | `/api/services` | Create a service (admin) |
| PUT | `/api/services/:id` | Update a service (admin) |
| DELETE | `/api/services/:id` | Delete a service (admin) |
| GET | `/api/orders` | List active orders |
| GET | `/api/orders/:id` | Get single order |
| POST | `/api/orders` | Place a new booking |
| PATCH | `/api/orders/:id/status` | Update order status |
| PATCH | `/api/orders/:id/cancel` | Cancel an order |
| GET | `/api/admin/stats` | Today's statistics |
| GET | `/api/salon/status` | Check if salon is open |

## Socket.IO Events

- `order:new` — New booking placed
- `order:updated` — Order status changed
- `service:created` — New service added
- `service:updated` — Service updated (including availability)
- `service:deleted` — Service removed
