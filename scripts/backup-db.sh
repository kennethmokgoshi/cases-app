#!/bin/bash

# ZenoCasesSystem - Automated Database Backup Script
# Place this in /opt/zenowethu/scripts/backup-db.sh on the VPS
# Usage: ./backup-db.sh

# Load environment variables from .env file
# Try several locations for .env
if [ -f "$(dirname "$0")/../.env" ]; then
    export $(cat "$(dirname "$0")/../.env" | grep -v '#' | xargs)
elif [ -f "/opt/zenowethu/.env" ]; then
    export $(cat "/opt/zenowethu/.env" | grep -v '#' | xargs)
fi

# Configuration
BACKUP_DIR="${BACKUP_DIR:-/opt/zenowethu/backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/zenocases_backup_${TIMESTAMP}.sql"
RETENTION_DAYS=7
DB_CONTAINER="db"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "Starting database backup: ${BACKUP_FILE}"

# Check if docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running."
    exit 1
fi

# Check if DB container is running
if [ $(docker ps -q -f name=${DB_CONTAINER} | wc -l) -eq 0 ]; then
    echo "ERROR: Database container '${DB_CONTAINER}' is not running."
    exit 1
fi

# Perform backup using docker exec
# We use docker exec directly instead of docker-compose to be more generic
docker exec -t ${DB_CONTAINER} pg_dump -U "${POSTGRES_USER:-postgres}" "${POSTGRES_DB:-postgres}" > "${BACKUP_FILE}"

# Check if backup was successful (size > 0)
if [ $? -eq 0 ] && [ -s "${BACKUP_FILE}" ]; then
    echo "Backup completed successfully."
    
    # Compress the backup
    gzip "${BACKUP_FILE}"
    echo "Backup compressed: ${BACKUP_FILE}.gz"
    
    # Remove old backups (older than RETENTION_DAYS)
    echo "Cleaning up backups older than ${RETENTION_DAYS} days..."
    find "${BACKUP_DIR}" -name "zenocases_backup_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
    
    echo "Cleanup complete."
else
    echo "ERROR: Backup failed or produced an empty file!"
    [ -f "${BACKUP_FILE}" ] && rm "${BACKUP_FILE}"
    exit 1
fi

# To automate this, add to crontab (run daily at 2 AM):
# 0 2 * * * /bin/bash /opt/zenowethu/scripts/backup-db.sh >> /var/log/zenowethu-backup.log 2>&1
