#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MONGO_HOST="${MONGO_HOST:-127.0.0.1}"
MONGO_PORT="${MONGO_PORT:-27018}"
RS_NAME="${RS_NAME:-rs0}"
DB_NAME="${DB_NAME:-runcloud_clone}"
DB_PATH="${DB_PATH:-$ROOT_DIR/.local/mongo-rs}"
LOG_PATH="$DB_PATH/mongod.log"

command -v mongod >/dev/null 2>&1 || { echo "mongod is required"; exit 1; }
command -v mongosh >/dev/null 2>&1 || { echo "mongosh is required"; exit 1; }

mkdir -p "$DB_PATH"

if ! mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" --eval 'db.adminCommand({ ping: 1 }).ok' >/dev/null 2>&1; then
  mongod \
    --dbpath "$DB_PATH" \
    --port "$MONGO_PORT" \
    --bind_ip "$MONGO_HOST" \
    --replSet "$RS_NAME" \
    --fork \
    --logpath "$LOG_PATH" \
    --nounixsocket >/dev/null
fi

STATE="$(mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" --eval 'try { rs.status().myState } catch (e) { 0 }')"
if [ "$STATE" = "0" ]; then
  mongosh --quiet --host "$MONGO_HOST" --port "$MONGO_PORT" --eval "rs.initiate({_id: '${RS_NAME}', members: [{ _id: 0, host: '${MONGO_HOST}:${MONGO_PORT}' }]})" >/dev/null
  sleep 2
fi

DATABASE_URL="mongodb://${MONGO_HOST}:${MONGO_PORT}/${DB_NAME}?replicaSet=${RS_NAME}"

for ENV_FILE in "$ROOT_DIR/.env" "$ROOT_DIR/apps/control-plane/.env"; do
  if [ ! -f "$ENV_FILE" ]; then
    cp "$ROOT_DIR/.env.example" "$ENV_FILE"
  fi

  if grep -q '^DATABASE_URL=' "$ENV_FILE"; then
    sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=${DATABASE_URL}|" "$ENV_FILE"
  else
    echo "DATABASE_URL=${DATABASE_URL}" >> "$ENV_FILE"
  fi

  echo "Updated $ENV_FILE"
done

echo "Mongo replica set ready at ${MONGO_HOST}:${MONGO_PORT}"
echo "DATABASE_URL=${DATABASE_URL}"
