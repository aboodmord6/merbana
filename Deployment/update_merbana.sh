#!/usr/bin/env bash
set -euo pipefail

# Merbana Linux updater
# - Pull latest code from origin/main
# - Build frontend
# - Deploy dist to ~/Desktop/POS
# - Preserve ~/Desktop/POS/data/db.json and SQLite data files
# - Keep last 3 backups
# - Restart app automatically

REPO_DIR="${REPO_DIR:-$HOME/Desktop/merbana}"
BRANCH="${BRANCH:-main}"
POS_DIR="${POS_DIR:-$HOME/Desktop/POS}"
DATA_DIR="${POS_DIR}/data"
DATA_FILE="${DATA_DIR}/db.json"
SQLITE_FILE="${DATA_DIR}/merbana.db"
SQLITE_WAL_FILE="${DATA_DIR}/merbana.db-wal"
SQLITE_SHM_FILE="${DATA_DIR}/merbana.db-shm"
ALEMBIC_INI="${REPO_DIR}/Deployment/backend/alembic.ini"
WRAPPER="${POS_DIR}/Merbana"
BACKUPS_DIR="${POS_DIR}/backups"
RETENTION="${RETENTION:-3}"
FORCE_JSON_REIMPORT="${FORCE_JSON_REIMPORT:-0}"
HEALTH_HOST="${HEALTH_HOST:-127.0.0.1}"
HEALTH_PORT="${HEALTH_PORT:-8741}"
HEALTH_PATH="${HEALTH_PATH:-/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-35}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info() { echo -e "${CYAN}[INFO] $*${RESET}"; }
ok() { echo -e "${GREEN}[OK] $*${RESET}"; }
warn() { echo -e "${YELLOW}[WARN] $*${RESET}"; }
fail() { echo -e "${RED}[ERROR] $*${RESET}" >&2; exit 1; }

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

run_alembic_upgrade() {
  [[ -f "${ALEMBIC_INI}" ]] || fail "Alembic config not found: ${ALEMBIC_INI}"

  local venv_python="${POS_DIR}/.venv/bin/python"
  [[ -x "${venv_python}" ]] || fail "Venv Python not found: ${venv_python}"

  local db_url
  db_url="sqlite:///${SQLITE_FILE}"

  info "Running Alembic migrations to head"
  MERBANA_DATA_PATH="${DATA_DIR}" \
  MERBANA_DB_URL="${db_url}" \
    "${venv_python}" -m alembic -c "${ALEMBIC_INI}" upgrade head
  ok "Alembic migrations completed."
}

wait_for_health() {
  local health_url
  health_url="http://${HEALTH_HOST}:${HEALTH_PORT}${HEALTH_PATH}"

  info "Waiting for backend health at ${health_url}"
  HEALTH_URL="${health_url}" HEALTH_TIMEOUT="${HEALTH_TIMEOUT}" python3 - <<'PY'
import os
import sys
import time
import urllib.request

url = os.environ["HEALTH_URL"]
timeout = float(os.environ.get("HEALTH_TIMEOUT", "35"))
deadline = time.time() + timeout

while time.time() < deadline:
    try:
        with urllib.request.urlopen(url, timeout=2.0) as response:
            if response.status == 200:
                sys.exit(0)
    except Exception:
        pass
    time.sleep(0.5)

sys.exit(1)
PY
}

migrate_legacy_json_if_needed() {
  local migration_script="${REPO_DIR}/Deployment/migrate_json_to_sqlite.py"
  local artifacts_dir="${POS_DIR}/artifacts"
  local force_mode=false
  local venv_python="${POS_DIR}/.venv/bin/python"

  [[ -x "${venv_python}" ]] || fail "Venv Python not found: ${venv_python}"

  if [[ "${FORCE_JSON_REIMPORT}" == "1" || "${FORCE_JSON_REIMPORT}" == "true" || "${FORCE_JSON_REIMPORT}" == "TRUE" ]]; then
    force_mode=true
    warn "FORCE_JSON_REIMPORT enabled: legacy JSON import may overwrite existing SQLite data."
  fi

  if [[ ! -f "${DATA_FILE}" ]]; then
    info "No legacy db.json found. Skipping migration."
    return
  fi

  if [[ -f "${SQLITE_FILE}" && "${force_mode}" != true ]]; then
    info "SQLite database already exists. Skipping legacy JSON migration."
    return
  fi

  [[ -f "${migration_script}" ]] || fail "Migration script not found: ${migration_script}"

  if [[ "${force_mode}" == true && -f "${SQLITE_FILE}" ]]; then
    info "Force mode active: rebuilding SQLite from legacy db.json"
  else
    info "Migrating legacy db.json into SQLite"
  fi
  mkdir -p "${DATA_DIR}" "${artifacts_dir}"

  if [[ "${force_mode}" == true ]]; then
    MERBANA_DATA_PATH="${DATA_DIR}" \
      "${venv_python}" "${migration_script}" \
        --source "${DATA_FILE}" \
        --artifacts-dir "${artifacts_dir}" \
        --overwrite
  else
    MERBANA_DATA_PATH="${DATA_DIR}" \
      "${venv_python}" "${migration_script}" \
        --source "${DATA_FILE}" \
        --artifacts-dir "${artifacts_dir}"
  fi

  [[ -f "${SQLITE_FILE}" ]] || fail "Migration completed but SQLite file missing: ${SQLITE_FILE}"
  ok "Legacy JSON migration to SQLite completed."
}

restore_from_backup() {
  local backup_path="$1"
  warn "Update failed. Restoring from backup: ${backup_path}"

  if [[ -d "${backup_path}/dist" ]]; then
    rm -rf "${POS_DIR}/dist"
    cp -r "${backup_path}/dist" "${POS_DIR}/dist"
    ok "Restored previous dist/."
  fi

  mkdir -p "${DATA_DIR}"

  if [[ -f "${backup_path}/db.json" ]]; then
    cp "${backup_path}/db.json" "${DATA_FILE}"
    ok "Restored db.json."
  fi

  if [[ -f "${backup_path}/merbana.db" ]]; then
    cp "${backup_path}/merbana.db" "${SQLITE_FILE}"
    ok "Restored merbana.db."
  fi

  if [[ -f "${backup_path}/merbana.db-wal" ]]; then
    cp "${backup_path}/merbana.db-wal" "${SQLITE_WAL_FILE}"
    ok "Restored merbana.db-wal."
  fi

  if [[ -f "${backup_path}/merbana.db-shm" ]]; then
    cp "${backup_path}/merbana.db-shm" "${SQLITE_SHM_FILE}"
    ok "Restored merbana.db-shm."
  fi
}

cleanup_old_backups() {
  mkdir -p "${BACKUPS_DIR}"
  mapfile -t backup_list < <(ls -1dt "${BACKUPS_DIR}"/* 2>/dev/null || true)
  if (( ${#backup_list[@]} > RETENTION )); then
    for old in "${backup_list[@]:RETENTION}"; do
      rm -rf "${old}"
      info "Removed old backup: ${old}"
    done
  fi
}

stop_app() {
  pkill -f "merbana_launcher.py" >/dev/null 2>&1 || true
  pkill -f "Merbana" >/dev/null 2>&1 || true
  pkill -f "uvicorn.*backend.app" >/dev/null 2>&1 || true
  sleep 1
}

start_app() {
  [[ -x "${WRAPPER}" ]] || fail "Launcher not found or not executable: ${WRAPPER}"
  nohup "${WRAPPER}" >/tmp/merbana-update-launch.log 2>&1 &
  disown || true
}

main() {
  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd python3

  [[ -d "${REPO_DIR}" ]] || fail "Repo directory not found: ${REPO_DIR}"
  git -C "${REPO_DIR}" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "Not a git repository: ${REPO_DIR}"
  [[ -d "${POS_DIR}" ]] || fail "POS directory not found: ${POS_DIR}"
  [[ -f "${WRAPPER}" ]] || fail "POS launcher not found: ${WRAPPER}"

  local ts backup_path had_data=false
  ts="$(date +%Y%m%d_%H%M%S)"
  backup_path="${BACKUPS_DIR}/${ts}"

  info "Creating backup at ${backup_path}"
  mkdir -p "${backup_path}"

  if [[ -d "${POS_DIR}/dist" ]]; then
    cp -r "${POS_DIR}/dist" "${backup_path}/dist"
  fi

  if [[ -f "${DATA_FILE}" ]]; then
    cp "${DATA_FILE}" "${backup_path}/db.json"
    had_data=true
  fi

  if [[ -f "${SQLITE_FILE}" ]]; then
    cp "${SQLITE_FILE}" "${backup_path}/merbana.db"
    had_data=true
  fi

  if [[ -f "${SQLITE_WAL_FILE}" ]]; then
    cp "${SQLITE_WAL_FILE}" "${backup_path}/merbana.db-wal"
    had_data=true
  fi

  if [[ -f "${SQLITE_SHM_FILE}" ]]; then
    cp "${SQLITE_SHM_FILE}" "${backup_path}/merbana.db-shm"
    had_data=true
  fi

  if [[ "${had_data}" != true ]]; then
    warn "No existing data files found under ${DATA_DIR}."
  fi

  cleanup_old_backups

  trap 'restore_from_backup "${backup_path}"' ERR

  info "Updating repository to latest origin/${BRANCH}"
  cd "${REPO_DIR}"
  git fetch origin "${BRANCH}"
  git checkout "${BRANCH}"
  git reset --hard "origin/${BRANCH}"

  info "Installing dependencies"
  npm ci --silent

  info "Building app"
  npm run build
  [[ -f "${REPO_DIR}/dist/index.html" ]] || fail "Build output missing: dist/index.html"

  info "Deploying new dist to ${POS_DIR}"
  rm -rf "${POS_DIR}/dist"
  cp -r "${REPO_DIR}/dist" "${POS_DIR}/dist"

  if [[ "${had_data}" == true ]]; then
    mkdir -p "${DATA_DIR}"

    if [[ -f "${backup_path}/db.json" ]]; then
      cp "${backup_path}/db.json" "${DATA_FILE}"
    fi

    if [[ -f "${backup_path}/merbana.db" ]]; then
      cp "${backup_path}/merbana.db" "${SQLITE_FILE}"
    fi

    if [[ -f "${backup_path}/merbana.db-wal" ]]; then
      cp "${backup_path}/merbana.db-wal" "${SQLITE_WAL_FILE}"
    fi

    if [[ -f "${backup_path}/merbana.db-shm" ]]; then
      cp "${backup_path}/merbana.db-shm" "${SQLITE_SHM_FILE}"
    fi
  fi

  stop_app

  migrate_legacy_json_if_needed
  run_alembic_upgrade

  info "Restarting app"
  start_app
  wait_for_health || fail "Backend health check failed after restart. Check /tmp/merbana-update-launch.log"
  ok "Backend health check passed."

  trap - ERR
  ok "Update complete. Running latest ${BRANCH} with preserved data."
  ok "Backup saved at: ${backup_path}"
}

main "$@"
