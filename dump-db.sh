#!/bin/bash
# Database dump script with ISO timestamp naming
# Usage: ./dump-db.sh [--restore <dump_file>]

set -e

# Load .env to get container name and credentials
if [ ! -f .env ]; then
    echo "Error: .env file not found"
    exit 1
fi

source .env

DUMP_DIR="/app/db_dump"
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DUMP_FILE="${DUMP_DIR}/backup_${TIMESTAMP}.dump"

# Check if restore mode
if [ "$1" = "--restore" ]; then
    if [ -z "$2" ]; then
        echo "Error: backup file path required for restore"
        echo "Usage: ./dump-db.sh --restore <path_to_dump_file>"
        exit 1
    fi
    
    RESTORE_FILE="$2"
    if [ ! -f "$RESTORE_FILE" ]; then
        echo "Error: restore file not found: $RESTORE_FILE"
        exit 1
    fi
    
    echo "🔄 Restoring from $RESTORE_FILE..."
    docker exec "${DATABASE}" pg_restore \
        -U "${POSTGRES_USER}" \
        -d "${CARCAEA_DB}" \
        --clean \
        --if-exists \
        "$RESTORE_FILE"
    echo "✅ Database restored successfully"
    exit 0
fi

# Dump mode (default)
echo "💾 Dumping database to $DUMP_FILE..."

# Ensure dump directory exists inside container
docker exec "${DATABASE}" mkdir -p "${DUMP_DIR}"

# Execute pg_dump inside container (binary format)
docker exec "${DATABASE}" pg_dump \
    -U "${POSTGRES_USER}" \
    -d "${CARCAEA_DB}" \
    --format=custom \
    --file="${DUMP_FILE}"

if [ $? -eq 0 ]; then
    FILE_SIZE=$(docker exec "${DATABASE}" ls -lh "${DUMP_FILE}" | awk '{print $5}')
    echo "✅ Database dumped successfully to ${DUMP_FILE}"
    echo "   File size: ${FILE_SIZE}"
else
    echo "❌ Database dump failed"
    exit 1
fi
