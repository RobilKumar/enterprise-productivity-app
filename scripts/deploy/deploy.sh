#!/bin/bash
# ============================================================
# Production Deployment Script — Ubuntu 22.04
# Usage: ./deploy.sh [--fresh | --update]
# ============================================================

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/yourorg/enterprise-productivity-app.git}"
APP_DIR="/opt/productivity-app"
LOG_FILE="/var/log/ep-deploy.log"

log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }
fail() { log "ERROR: $*"; exit 1; }

log "═══ Enterprise Productivity App — Deployment Starting ═══"

# ─── 1. Prerequisites ────────────────────────────────────────
log "Installing prerequisites..."
apt-get update -qq
apt-get install -y -qq curl git unzip apt-transport-https ca-certificates gnupg lsb-release

# Docker
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | bash
  usermod -aG docker $USER
fi

# Docker Compose
if ! command -v docker compose &>/dev/null; then
  log "Installing Docker Compose..."
  COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
  curl -SL "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
fi

# ─── 2. Clone or pull repo ────────────────────────────────────
if [ "${1:-}" == "--fresh" ] || [ ! -d "${APP_DIR}/.git" ]; then
  log "Fresh install — cloning repo..."
  rm -rf "${APP_DIR}"
  git clone "${REPO_URL}" "${APP_DIR}"
else
  log "Updating existing installation..."
  cd "${APP_DIR}"
  git pull origin main
fi

cd "${APP_DIR}"

# ─── 3. Configure environment ────────────────────────────────
if [ ! -f ".env" ]; then
  cp .env.example .env
  log "⚠  .env file created from example — please review and fill in secrets before continuing!"
  log "Edit: nano ${APP_DIR}/.env"
  exit 0
fi

# ─── 4. SSL Certificates ─────────────────────────────────────
mkdir -p nginx/ssl
if [ ! -f nginx/ssl/cert.pem ]; then
  log "Generating self-signed SSL certificate (replace with real cert in production)..."
  openssl req -x509 -newkey rsa:4096 -keyout nginx/ssl/key.pem -out nginx/ssl/cert.pem \
    -days 365 -nodes -subj "/C=IN/ST=Maharashtra/L=Pune/O=Company/CN=productivity.local"
fi

# ─── 5. Build & Start ─────────────────────────────────────────
log "Building and starting containers..."
docker compose pull
docker compose build --no-cache
docker compose up -d

# ─── 6. Wait for SQL Server ───────────────────────────────────
log "Waiting for SQL Server to be ready (up to 120s)..."
for i in $(seq 1 24); do
  if docker compose exec -T sqlserver /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P "${DB_PASSWORD}" -Q "SELECT 1" &>/dev/null; then
    log "SQL Server ready"
    break
  fi
  sleep 5
  [ $i -eq 24 ] && fail "SQL Server did not become ready in time"
done

# ─── 7. Run migrations ───────────────────────────────────────
log "Running database migrations..."
docker compose exec -T backend npx prisma migrate deploy || log "Warning: migration step failed (may be first run)"

# ─── 8. Seed initial data ─────────────────────────────────────
if [ "${SEED_DB:-false}" == "true" ]; then
  log "Seeding database..."
  docker compose exec -T backend npm run seed
fi

# ─── 9. Setup cron (backup) ──────────────────────────────────
if ! crontab -l 2>/dev/null | grep -q "backup.sh"; then
  log "Setting up backup cron job..."
  chmod +x "${APP_DIR}/scripts/backup/backup.sh"
  (crontab -l 2>/dev/null; echo "0 2 * * * ${APP_DIR}/scripts/backup/backup.sh >> /var/log/ep-backup.log 2>&1") | crontab -
fi

# ─── 10. UFW Firewall ─────────────────────────────────────────
if command -v ufw &>/dev/null; then
  log "Configuring firewall..."
  ufw allow 22/tcp
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
fi

log "═══ Deployment Completed! ═══"
log "Admin Panel → https://$(curl -s ifconfig.me)"
log "API Docs    → https://$(curl -s ifconfig.me)/api-docs"
log "Grafana     → http://$(curl -s ifconfig.me):3001  (admin / ${GRAFANA_ADMIN_PASSWORD:-GrafanaAdmin123})"
log "MinIO       → http://$(curl -s ifconfig.me):9001  (${MINIO_ACCESS_KEY:-minioadmin})"
