# Personal Finance Tracker

Track personal income and expenses with role-based access, monthly/yearly
analytics, and Chart.js dashboards.

- **Frontend:** React 18 + Vite + Chart.js + react-window
- **Backend:** Node.js + Express + Sequelize (MySQL or SQLite)
- **Cache:** Redis (in-memory fallback if Redis isn't running)
- **Auth:** JWT with three roles — `admin`, `user`, `read-only`

## Prerequisites

- Node.js 18+

Optional (for full setup):
- MySQL 8+
- Redis (Memurai on Windows, or `apt install redis-server` in WSL)

If MySQL/Redis aren't available, leave both URLs blank in `.env` and the
app falls back to a local SQLite file plus an in-memory cache.

## Setup

### 1. Backend

```powershell
cd backend
npm install
copy .env.example .env
npm run seed           // this is for demo account
npm run dev
```

API: http://localhost:4000  ·  Swagger: http://localhost:4000/api/docs

### 2. Frontend (new terminal)

```powershell
cd frontend
npm install
npm run dev
```

App: http://localhost:5173

## Demo accounts (created by `npm run seed`)

|Role|       | Email                  | Password      |

| admin      | admin@example.com      | Admin123!     |
| user       | user@example.com       | User123!      |
| read-only  | readonly@example.com   | ReadOnly123!  |

### Creating admin or read-only accounts

using resigter account we create user account but for admin and read-only account as of now we have to create via backened change seed.file.

