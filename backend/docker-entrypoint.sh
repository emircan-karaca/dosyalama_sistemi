#!/bin/sh
set -e

MOUNT_PATH="${MOUNT_PATH:-/mnt/smb}"

if [ "${SMB_MOUNT_ENABLED:-false}" = "true" ]; then
  if [ -z "$SMB_MOUNT_HOST" ] || [ -z "$SMB_MOUNT_SHARE" ]; then
    echo "SMB_MOUNT_ENABLED=true but SMB_MOUNT_HOST or SMB_MOUNT_SHARE missing"
    exit 1
  fi
  mkdir -p "$MOUNT_PATH"
  if ! mountpoint -q "$MOUNT_PATH"; then
    OPTS="username=${SMB_MOUNT_USERNAME:-guest},password=${SMB_MOUNT_PASSWORD:-},vers=3.0,uid=0,gid=0"
    echo "Mounting //$SMB_MOUNT_HOST/$SMB_MOUNT_SHARE to $MOUNT_PATH"
    mount -t cifs "//$SMB_MOUNT_HOST/$SMB_MOUNT_SHARE" "$MOUNT_PATH" -o "$OPTS"
  fi
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
