#!/bin/bash
# ============================================================
# Automated SQL Server Database Backup
# Schedule via cron: 0 2 * * * /opt/productivity-app/scripts/backup/backup.sh
# ============================================================

set -euo pipefail

# Load env
source /opt/productivity-app/.env 2>/dev/null || true

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-1433}"
DB_NAME="${DB_NAME:-ProductivityDB}"
DB_USER="${DB_USER:-sa}"
DB_PASS="${DB_PASSWORD:-YourStrong@Password123}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/productivity-app}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/backup_${DB_NAME}_${DATE}.bak"
LOG_FILE="${BACKUP_DIR}/backup.log"

mkdir -p "${BACKUP_DIR}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "${LOG_FILE}"; }

log "Starting backup of ${DB_NAME}..."

# SQL Server backup via sqlcmd
/opt/mssql-tools/bin/sqlcmd \
  -S "${DB_HOST},${DB_PORT}" \
  -U "${DB_USER}" \
  -P "${DB_PASS}" \
  -Q "BACKUP DATABASE [${DB_NAME}] TO DISK = '${BACKUP_FILE}' WITH FORMAT, INIT, COMPRESSION, CHECKSUM, STATS = 10;" \
  2>>"${LOG_FILE}"

if [ $? -eq 0 ]; then
  log "Backup created: ${BACKUP_FILE}"
  SIZE=$(du -sh "${BACKUP_FILE}" | cut -f1)
  log "Backup size: ${SIZE}"

  # Compress
  gzip "${BACKUP_FILE}"
  log "Compressed to ${BACKUP_FILE}.gz"

  # Upload to S3/MinIO if configured
  if [ -n "${BACKUP_S3_BUCKET:-}" ] && command -v aws &>/dev/null; then
    aws s3 cp "${BACKUP_FILE}.gz" "s3://${BACKUP_S3_BUCKET}/db-backups/$(basename ${BACKUP_FILE}.gz)" \
      --storage-class STANDARD_IA 2>>"${LOG_FILE}" && log "Uploaded to S3: ${BACKUP_S3_BUCKET}"
  fi

  # Remove old backups beyond retention
  find "${BACKUP_DIR}" -name "backup_${DB_NAME}_*.bak.gz" -mtime "+${RETENTION_DAYS}" -delete
  log "Cleaned up backups older than ${RETENTION_DAYS} days"

  log "Backup completed successfully"
else
  log "ERROR: Backup FAILED for ${DB_NAME}"
  # Send alert (customize as needed)
  exit 1
fi
