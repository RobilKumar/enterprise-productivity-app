#!/bin/bash
# ============================================================
# Enterprise Productivity App — Hostinger VPS Deploy Script
# OS: Ubuntu 22.04 LTS
# Run as root:  bash deploy.sh yourdomain.com your@email.com
# ============================================================
set -e

DOMAIN="${1}"
EMAIL="${2}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: bash deploy.sh yourdomain.com your@email.com"
  exit 1
fi

echo ""
echo "=============================================="
echo "  Deploying Enterprise Productivity App"
echo "  Domain : $DOMAIN"
echo "  Email  : $EMAIL"
echo "=============================================="
echo ""

# ── 1. System update ─────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -qq && apt-get upgrade -y -qq

# ── 2. Install Docker ────────────────────────────────────────
echo "[2/8] Installing Docker..."
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi
docker --version

# Install Docker Compose v2 plugin
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin -qq
fi
docker compose version

# ── 3. Install Certbot ───────────────────────────────────────
echo "[3/8] Installing Certbot..."
apt-get install -y certbot -qq

# ── 4. Create directory structure ────────────────────────────
echo "[4/8] Creating directories..."
mkdir -p /var/www/certbot
mkdir -p /etc/letsencrypt

# ── 5. Patch nginx.prod.conf with real domain ────────────────
echo "[5/8] Configuring nginx for domain: $DOMAIN ..."
sed -i "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" nginx/nginx.prod.conf

# ── 6. Patch .env.production with real domain ────────────────
echo "[6/8] Patching .env.production..."
sed -i "s/CHANGE_ME_yourdomain.com/$DOMAIN/g" .env.production

# ── 7. Get SSL certificate (standalone — ports must be free) ─
echo "[7/8] Obtaining Let's Encrypt SSL certificate..."
# Stop any service using port 80 temporarily
docker compose -f docker-compose.prod.yml down 2>/dev/null || true

certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  -d "$DOMAIN" \
  -d "www.$DOMAIN" \
  --expand

# Set up auto-renewal cron
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose -f /$(pwd)/docker-compose.prod.yml restart nginx") | crontab -

echo "  SSL certificate obtained!"

# ── 8. Build and start all services ──────────────────────────
echo "[8/8] Building and starting all Docker services..."
cp .env.production .env.production.active

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

echo ""
echo "=============================================="
echo "  Waiting for services to become healthy..."
echo "=============================================="
sleep 30

# Check backend health
for i in {1..12}; do
  if curl -sf "http://localhost/health" > /dev/null 2>&1; then
    echo "  ✅ Backend is healthy!"
    break
  fi
  echo "  Waiting... ($i/12)"
  sleep 10
done

echo ""
echo "=============================================="
echo "  ✅  DEPLOYMENT COMPLETE!"
echo "=============================================="
echo ""
echo "  Web Dashboard : https://$DOMAIN"
echo "  API Base URL  : https://$DOMAIN/api/v1"
echo "  Health Check  : https://$DOMAIN/health"
echo ""
echo "  ➡  Update your mobile .env.mobile:"
echo "     VITE_API_URL=https://$DOMAIN/api/v1"
echo ""
echo "  ➡  Seed the database (first time only):"
echo "     docker exec ep_backend node dist/utils/seed.js"
echo ""
echo "  ⚠  IMPORTANT: Edit .env.production and change all"
echo "     CHANGE_ME values before going live!"
echo "=============================================="
