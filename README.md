# 🚀 Enterprise Productivity & Work Monitoring System

A production-ready, full-stack enterprise application for managing team productivity, task tracking, attendance, leave management, KPI reporting, real-time chat, and gamification.

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **Mobile App** | React Native 0.74 + TypeScript + Redux Toolkit + Socket.IO |
| **Backend API** | Node.js 20 + Express + TypeScript + Prisma ORM |
| **Admin Dashboard** | React 18 + Vite + Recharts + React Router |
| **Database** | SQL Server 2022 (primary) / MySQL 8 (compat) |
| **Cache** | Redis 7 |
| **Object Storage** | MinIO (S3-compatible) |
| **Push Notifications** | Firebase Cloud Messaging |
| **Reverse Proxy** | NGINX 1.25 |
| **Monitoring** | Prometheus + Grafana |
| **Container** | Docker + Docker Compose |
| **CI/CD** | GitHub Actions |

---

## 🗂️ Project Structure

```
enterprise-productivity-app/
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── config/             # DB, Redis, MinIO, Firebase, Swagger
│   │   ├── controllers/        # Auth, Task, KPI, Upload
│   │   ├── jobs/               # Cron jobs (escalation, reminders, metrics)
│   │   ├── middleware/         # Auth/RBAC, error handler, rate limiter
│   │   ├── routes/             # 19 route modules
│   │   ├── services/           # Notifications, Email, Gamification, PDF, Excel
│   │   ├── sockets/            # Socket.IO real-time handlers
│   │   ├── tests/              # Unit + integration tests
│   │   ├── types/              # TypeScript types
│   │   └── utils/              # Logger, Metrics, Seed
│   ├── package.json
│   └── tsconfig.json
├── admin-dashboard/            # React + Vite admin panel
│   ├── src/
│   │   ├── pages/              # Dashboard, Employees, Tasks, Attendance, Leave, Audit...
│   │   └── App.tsx             # Root with auth, theming, routing
│   ├── package.json
│   └── vite.config.ts
├── mobile-app/                 # React Native mobile app
│   ├── src/
│   │   ├── navigation/         # Bottom tabs + Drawer navigator
│   │   ├── screens/            # Login, Dashboard, Tasks, Task Detail, Timer...
│   │   ├── services/           # Axios API client, Socket.IO service
│   │   ├── store/              # Redux slices (auth, tasks, timer, chat, kpi)
│   │   └── hooks/              # useTheme
│   └── App.tsx
├── database/
│   ├── schema.prisma           # Complete Prisma schema (30+ models)
│   └── setup.sql               # SQL Server DDL + stored procedures
├── docker/
│   ├── Dockerfile.backend
│   └── Dockerfile.admin
├── nginx/
│   └── nginx.conf              # HTTPS, rate limiting, WebSocket proxy
├── scripts/
│   ├── backup/backup.sh        # Automated DB backup to S3
│   ├── deploy/deploy.sh        # Ubuntu 22.04 production deploy
│   └── monitoring/
│       ├── prometheus.yml
│       └── grafana/            # Datasources + dashboard provisioning
├── .github/workflows/ci.yml    # CI/CD pipeline
├── docker-compose.yml
└── .env.example
```

---

## 🚀 Quick Start

### Prerequisites
- Docker 24+ and Docker Compose v2
- Node.js 20+ (for local development)
- Git

### 1. Clone & configure
```bash
git clone <your-repo> enterprise-productivity-app
cd enterprise-productivity-app
cp .env.example .env
# Edit .env — fill in JWT_SECRET, DB_PASSWORD, SMTP, FCM credentials
nano .env
```

### 2. Generate SSL certificates (dev)
```bash
mkdir -p nginx/ssl
openssl req -x509 -newkey rsa:4096 -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem \
  -days 365 -nodes -subj "/CN=localhost"
```

### 3. Start all services
```bash
docker compose up -d
```

### 4. Wait for SQL Server, then run migrations + seed
```bash
sleep 30
docker compose exec backend npx prisma migrate deploy
docker compose exec backend npm run seed
```

### 5. Access the application
| Service | URL | Credentials |
|---|---|---|
| Admin Dashboard | https://localhost | superadmin@company.com / Admin@123456 |
| API Documentation | https://localhost/api-docs | — |
| Grafana | http://localhost:3001 | admin / GrafanaAdmin123 |
| MinIO Console | http://localhost:9001 | minioadmin / minioadmin123 |
| Prometheus | http://localhost:9090 | — |

---

## 🔧 Local Development

### Backend
```bash
cd backend
npm install
cp ../.env.example .env  # configure DB, Redis etc.
npx prisma generate
npx prisma migrate dev
npm run dev              # ts-node-dev with hot reload on :5000
```

### Admin Dashboard
```bash
cd admin-dashboard
npm install
npm run dev              # Vite on :3000 with /api proxy to :5000
```

### Mobile App
```bash
cd mobile-app
npm install
# iOS: cd ios && pod install && cd ..
npm run android          # or npm run ios
```

---

## 👥 User Roles & Permissions

| Role | Capabilities |
|---|---|
| **Super Admin** | Full system access, manage all users and settings |
| **Admin** | User management, all reports, department-wide tasks |
| **Manager** | Team KPIs, task creation, leave approval, reports |
| **Team Leader** | Team task management, team reports, attendance correction |
| **Employee** | Own tasks, check-in/out, leave requests, daily summaries |

---

## 📡 API Overview

All endpoints are prefixed with `/api/v1`. Auth via `Authorization: Bearer <token>`.

| Module | Endpoints |
|---|---|
| Auth | POST /auth/login, /refresh, /logout, /forgot-password, /verify-otp, /reset-password |
| Users | CRUD /users, password change, FCM token, avatar upload |
| Tasks | CRUD /tasks, status transitions, comments, attachments |
| Teams | CRUD /teams, stats |
| Departments | CRUD /departments |
| Attendance | /attendance/checkin, /checkout, /my, /summary |
| Leave | /leaves, /leaves/my, /leaves/:id/review |
| KPI | /kpi/dashboard, /user, /team, /company, /ranking, /report/download |
| Notifications | GET/PATCH /notifications, /unread-count |
| Chat | /chat/rooms, /chat/rooms/:id/messages |
| Announcements | CRUD /announcements |
| Reviews | CRUD /reviews, /reviews/:id/acknowledge |
| Shifts | CRUD /shifts |
| Timer | /timer/start, /stop, /pause, /active, /logs |
| Audit | GET /audit (admin only) |
| Leaderboard | GET /leaderboard |
| Reports | GET /reports/download (PDF/Excel/CSV) |

Full interactive docs at `/api-docs` (Swagger UI).

---

## ⚡ Real-Time Features (Socket.IO)

- Task status updates broadcast to subscribers
- In-app notifications pushed instantly
- Team and direct chat messaging with typing indicators
- Presence indicators (online/offline)
- Live timer sync between mobile and server

---

## 🎮 Gamification

- **Points**: 10 base + 5 on-time bonus + 10 early-completion bonus per task
- **Badges**: First Task, Task Champion (10), Productivity Pro (50), Century Club (100), Early Bird
- **Leaderboards**: Weekly and monthly, per team or company-wide
- Cron job updates rank positions every Sunday midnight

---

## ⚙️ Cron Jobs

| Schedule | Job |
|---|---|
| Every 30 min | Auto-escalate overdue tasks |
| Daily 8:00 AM | Deadline reminder notifications |
| Daily 11:00 PM | Calculate productivity metrics |
| Daily midnight | Generate recurring task instances |
| Daily 11:55 PM | Auto-mark absent employees |
| Weekly Sunday midnight | Update leaderboard ranks |

---

## 🔒 Security

- JWT access tokens (15m) with refresh token rotation (7d)
- bcrypt password hashing (cost=12)
- RBAC guards on every route
- Rate limiting: global (200/15min), auth (10/15min), upload (20/min)
- NGINX SSL/TLS 1.2+, security headers, IP-restricted metrics endpoint
- Soft deletes preserve data integrity
- Full audit log of all write operations

---

## 🧪 Testing

```bash
cd backend
npm test                    # all tests
npm run test:unit           # unit tests only
npm test -- --coverage      # with coverage report
```

---

## 📊 Monitoring

Prometheus scrapes `/metrics` every 15s. Grafana is pre-provisioned with:
- HTTP request rate, error rate, P95/P99 latency
- Node.js memory (heap used/total)
- Response time percentile histograms

---

## 🚀 Production Deployment

```bash
# Ubuntu 22.04 one-command deploy
REPO_URL=https://github.com/yourorg/app.git bash scripts/deploy/deploy.sh
```

The script installs Docker, clones the repo, generates SSL certs, brings up all containers, runs migrations, and configures automated DB backups.

---

## 📱 Mobile App (React Native)

**Screens**:  Login → Dashboard → Tasks List → Task Detail → Timer → KPI → Chat → Notifications → Attendance → Leave → Leaderboard → Profile → Settings

**Features**:
- Offline-aware with request queuing
- Auto token refresh with concurrent request queuing
- Background push notifications via FCM
- Real-time task and chat updates via Socket.IO
- Dark/light theme
- Biometric authentication ready (configure in Settings screen)

---

## 🙏 License

MIT — see LICENSE file.
