#!/usr/bin/env bash
set -euo pipefail

# One-command Ubuntu setup for Merbana POS on a target machine.
# What it does:
# 1) Installs Ubuntu dependencies (Python, Node, GTK/WebKit for pywebview)
# 2) Builds frontend (npm ci + npm run build)
# 3) Creates Desktop POS layout (~/Desktop/POS by default)
# 4) Copies backend runtime into POS folder
# 5) Creates app venv and installs backend + pywebview dependencies
# 6) Runs Alembic migrations for POS database
# 7) Writes GUI launcher and wrapper scripts
# 8) Creates desktop shortcuts (.desktop) with Terminal=false

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RESET='\033[0m'

info() { echo -e "${CYAN}[INFO] $*${RESET}"; }
ok() { echo -e "${GREEN}[OK] $*${RESET}"; }
warn() { echo -e "${YELLOW}[WARN] $*${RESET}"; }
fail() { echo -e "${RED}[ERROR] $*${RESET}" >&2; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
POS_DIR="${POS_DIR:-${HOME}/Desktop/POS}"
VENV_DIR="${VENV_DIR:-${POS_DIR}/.venv}"
WRAPPER_PATH="${WRAPPER_PATH:-${POS_DIR}/Merbana}"
DESKTOP_FILE="${DESKTOP_FILE:-${HOME}/Desktop/Merbana.desktop}"
APP_MENU_FILE="${HOME}/.local/share/applications/Merbana.desktop"
POS_DESKTOP_FILE="${POS_DIR}/Merbana.desktop"
POS_APP_DIR="${POS_DIR}/app"
RUNTIME_LAUNCHER_PY="${POS_DIR}/merbana_pos_launcher.py"
BACKEND_SRC_DIR="${REPO_DIR}/backend"
BACKEND_DST_DIR="${POS_APP_DIR}/backend"
DEPLOY_BACKEND_SRC_DIR="${REPO_DIR}/Deployment/backend"
DEPLOY_BACKEND_DST_DIR="${POS_APP_DIR}/Deployment/backend"
DIST_SRC="${REPO_DIR}/dist"
DIST_DST="${POS_DIR}/dist"
DATA_DIR="${POS_DIR}/data"
ARTIFACTS_DIR="${POS_DIR}/artifacts"
BACKUPS_DIR="${POS_DIR}/backups"
ALEMBIC_INI_DST="${DEPLOY_BACKEND_DST_DIR}/alembic.ini"
PYTHON_VERSION="${PYTHON_VERSION:-3.12.10}"
UV_BIN="${UV_BIN:-$HOME/.local/bin/uv}"

WEBKIT_GIR_PACKAGE=""
PYWEBVIEW_SPEC="${PYWEBVIEW_SPEC:-}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing command: $1"
}

require_sudo() {
  require_cmd sudo
  if ! sudo -n true >/dev/null 2>&1; then
    info "Sudo access is required for OS package installation."
    sudo -v
  fi
}

ensure_uv_and_python() {
  if [[ ! -x "${UV_BIN}" ]]; then
    info "Installing uv at ${UV_BIN}"
    require_cmd curl
    curl -LsSf https://astral.sh/uv/install.sh | sh
  fi

  [[ -x "${UV_BIN}" ]] || fail "uv installation failed. Expected binary at ${UV_BIN}"

  info "Installing Python ${PYTHON_VERSION} with uv"
  "${UV_BIN}" python install "${PYTHON_VERSION}"
}

parse_ubuntu_release() {
  if [[ ! -f /etc/os-release ]]; then
    fail "Cannot detect distribution: /etc/os-release not found"
  fi

  # shellcheck disable=SC1091
  source /etc/os-release
  DISTRO_ID="${ID:-unknown}"
  DISTRO_VERSION="${VERSION_ID:-0}"

  if [[ "${DISTRO_ID}" != "ubuntu" ]]; then
    fail "Unsupported distribution: ${DISTRO_ID}. This installer supports Ubuntu only."
  fi

  info "Detected Ubuntu version: ${DISTRO_VERSION}"
}

choose_webkit_package() {
  case "${DISTRO_VERSION}" in
    24.*|25.*|26.*) WEBKIT_GIR_PACKAGE="gir1.2-webkitgtk-6.0" ;;
    22.*|23.*)       WEBKIT_GIR_PACKAGE="gir1.2-webkit2-4.1" ;;
    20.*|21.*)       WEBKIT_GIR_PACKAGE="gir1.2-webkit2-4.0" ;;
    *)               WEBKIT_GIR_PACKAGE="gir1.2-webkit2-4.1" ;;
  esac

  if [[ -z "${PYWEBVIEW_SPEC}" ]]; then
    case "${WEBKIT_GIR_PACKAGE}" in
      gir1.2-webkitgtk-6.0) PYWEBVIEW_SPEC="pywebview>=5,<6" ;;
      gir1.2-webkit2-4.1)   PYWEBVIEW_SPEC="pywebview>=4.4,<5" ;;
      gir1.2-webkit2-4.0)   PYWEBVIEW_SPEC="pywebview>=3.7,<4" ;;
      *)                    PYWEBVIEW_SPEC="pywebview>=4,<6" ;;
    esac
  fi

  info "Using GTK WebKit package: ${WEBKIT_GIR_PACKAGE}"
  info "Using pywebview spec: ${PYWEBVIEW_SPEC}"
}

install_os_dependencies() {
  if ! command -v apt-get >/dev/null 2>&1; then
    fail "apt-get not found. This installer supports Ubuntu only."
  fi

  require_sudo
  sudo apt-get update

  local base_packages=(
    git
    curl
    python3
    python3-venv
    python3-pip
    python3-gi
    python3-gi-cairo
    gir1.2-gtk-3.0
  )

  local webkit_package="${WEBKIT_GIR_PACKAGE}"
  local webkit_fallbacks=("gir1.2-webkitgtk-6.0" "gir1.2-webkit2-4.1" "gir1.2-webkit2-4.0")

  info "Installing base OS packages via apt"
  sudo apt-get install -y "${base_packages[@]}"

  info "Installing WebKit GTK package (${webkit_package})"
  if ! sudo apt-get install -y "${webkit_package}"; then
    warn "Primary WebKit package install failed, trying compatible fallbacks"
    local installed=false
    local candidate
    for candidate in "${webkit_fallbacks[@]}"; do
      if sudo apt-get install -y "${candidate}"; then
        WEBKIT_GIR_PACKAGE="${candidate}"
        installed=true
        break
      fi
    done
    if [[ "${installed}" != true ]]; then
      fail "Could not install any supported WebKit GTK package"
    fi
  fi
}

build_frontend() {
  [[ -f "${REPO_DIR}/package.json" ]] || fail "package.json not found at ${REPO_DIR}"
  require_cmd npm

  info "Installing Node dependencies"
  (cd "${REPO_DIR}" && npm ci)

  info "Building frontend"
  (cd "${REPO_DIR}" && npm run build)

  [[ -f "${DIST_SRC}/index.html" ]] || fail "Build output missing: ${DIST_SRC}/index.html"
  ok "Frontend build complete"
}

setup_pos_layout() {
  info "Creating POS layout at ${POS_DIR}"
  mkdir -p "${POS_DIR}" "${DATA_DIR}" "${ARTIFACTS_DIR}" "${BACKUPS_DIR}" "${POS_APP_DIR}"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${DIST_SRC}/" "${DIST_DST}/"
  else
    rm -rf "${DIST_DST}"
    cp -r "${DIST_SRC}" "${DIST_DST}"
  fi

  ok "POS layout ready"
}

copy_runtime_sources() {
  [[ -d "${BACKEND_SRC_DIR}" ]] || fail "Backend source missing: ${BACKEND_SRC_DIR}"
  [[ -d "${DEPLOY_BACKEND_SRC_DIR}" ]] || fail "Alembic source missing: ${DEPLOY_BACKEND_SRC_DIR}"

  info "Copying backend runtime into ${POS_APP_DIR}"
  mkdir -p "${BACKEND_DST_DIR}" "${POS_APP_DIR}/Deployment" "${DEPLOY_BACKEND_DST_DIR}"

  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${BACKEND_SRC_DIR}/" "${BACKEND_DST_DIR}/"
    rsync -a --delete "${DEPLOY_BACKEND_SRC_DIR}/" "${DEPLOY_BACKEND_DST_DIR}/"
  else
    rm -rf "${BACKEND_DST_DIR}" "${DEPLOY_BACKEND_DST_DIR}"
    mkdir -p "${BACKEND_DST_DIR}" "${DEPLOY_BACKEND_DST_DIR}"
    cp -r "${BACKEND_SRC_DIR}/." "${BACKEND_DST_DIR}/"
    cp -r "${DEPLOY_BACKEND_SRC_DIR}/." "${DEPLOY_BACKEND_DST_DIR}/"
  fi

  ok "Backend runtime copied"
}

setup_venv_and_python_deps() {
  info "Creating Python ${PYTHON_VERSION} virtual environment at ${VENV_DIR}"
  "${UV_BIN}" venv --python "${PYTHON_VERSION}" --seed "${VENV_DIR}"

  [[ -x "${VENV_DIR}/bin/python" ]] || fail "Python executable missing in venv: ${VENV_DIR}/bin/python"
  if ! "${VENV_DIR}/bin/python" -m pip --version >/dev/null 2>&1; then
    info "pip not present in venv, bootstrapping with ensurepip"
    "${VENV_DIR}/bin/python" -m ensurepip --upgrade
  fi

  info "Installing Python dependencies in venv"
  "${UV_BIN}" pip install --python "${VENV_DIR}/bin/python" --upgrade pip setuptools wheel
  "${UV_BIN}" pip install --python "${VENV_DIR}/bin/python" -r "${REPO_DIR}/requirements.txt"
  "${UV_BIN}" pip install --python "${VENV_DIR}/bin/python" "${PYWEBVIEW_SPEC}" "uvicorn[standard]" "pydantic-settings"

  ok "Python environment ready"
}

run_migrations() {
  [[ -f "${ALEMBIC_INI_DST}" ]] || fail "Alembic config not found: ${ALEMBIC_INI_DST}"

  local db_url
  db_url="sqlite:///${DATA_DIR}/merbana.db"

  info "Running Alembic migrations for POS database"
  MERBANA_DIST_PATH="${DIST_DST}" \
  MERBANA_DATA_PATH="${DATA_DIR}" \
  MERBANA_DB_URL="${db_url}" \
  "${VENV_DIR}/bin/python" -m alembic -c "${ALEMBIC_INI_DST}" upgrade head

  ok "Database migrations complete"
}

def _is_port_open(host: str, port: int) -> bool:
def _wait_for_health(url: str, timeout: float = 30.0) -> bool:
def _start_backend():
def _show_error(message: str) -> None:
def main() -> int:
write_runtime_launcher() {
  info "Writing browser-based runtime launcher at ${RUNTIME_LAUNCHER_PY}"
  cat > "${RUNTIME_LAUNCHER_PY}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

VENV_PY="${VENV_DIR}/bin/python"
APP_DIR="${POS_APP_DIR}"
LOG_FILE="${DATA_DIR}/launcher.log"
HOST="127.0.0.1"
PORT="${MERBANA_PORT:-8741}"

MERBANA_DIST_PATH="${DIST_DST}" \
MERBANA_DATA_PATH="${DATA_DIR}" \
MERBANA_DB_URL="sqlite:///${DATA_DIR}/merbana.db" \
nohup "${VENV_PY}" -m uvicorn backend.app:app --host "${HOST}" --port "${PORT}" --app-dir "${APP_DIR}" > "${LOG_FILE}" 2>&1 &

sleep 2

timeout=30
until curl -s "http://${HOST}:${PORT}/api/health" | grep -q '"status":'; do
  timeout=$((timeout-1))
  if [ "$timeout" -le 0 ]; then
  echo "Backend failed to start. Check launcher.log in POS/data for details."
  exit 1
  fi
  sleep 1
done

xdg-open "http://${HOST}:${PORT}" || echo "Open http://${HOST}:${PORT} in your browser."
EOF
  chmod +x "${RUNTIME_LAUNCHER_PY}"
  ok "Browser-based runtime launcher created"
}

write_wrapper() {
  info "Writing no-terminal app wrapper at ${WRAPPER_PATH}"

  cat > "${WRAPPER_PATH}" <<EOF
#!/usr/bin/env bash
set -euo pipefail

VENV_PY="${VENV_DIR}/bin/python"
LAUNCHER_PY="${RUNTIME_LAUNCHER_PY}"

if [[ ! -x "\${VENV_PY}" ]]; then
  echo "[ERROR] Python venv not found at \${VENV_PY}" >&2
  exit 1
fi

if [[ ! -f "\${LAUNCHER_PY}" ]]; then
  echo "[ERROR] Launcher not found at \${LAUNCHER_PY}" >&2
  exit 1
fi

exec "\${VENV_PY}" "\${LAUNCHER_PY}"
EOF

  chmod +x "${WRAPPER_PATH}"
  ok "Wrapper created"
}

write_desktop_shortcut() {
  info "Creating desktop shortcuts"
  mkdir -p "$(dirname "${DESKTOP_FILE}")" "$(dirname "${APP_MENU_FILE}")" "${POS_DIR}"

  cat > "${POS_DESKTOP_FILE}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Merbana POS
Comment=Launch Merbana POS (double-click)
Exec=${WRAPPER_PATH}
Terminal=false
Categories=Office;
StartupNotify=true
Path=${POS_DIR}
EOF

  cp "${POS_DESKTOP_FILE}" "${DESKTOP_FILE}"
  cp "${POS_DESKTOP_FILE}" "${APP_MENU_FILE}"

  chmod +x "${POS_DESKTOP_FILE}"
  chmod +x "${DESKTOP_FILE}"
  chmod +x "${APP_MENU_FILE}"

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$(dirname "${APP_MENU_FILE}")" >/dev/null 2>&1 || true
  fi

  ok "Desktop shortcuts created"
}

print_summary() {
  echo
  ok "Merbana Ubuntu target setup completed"
  echo "  Repo:        ${REPO_DIR}"
  echo "  POS dir:     ${POS_DIR}"
  echo "  POS app:     ${POS_APP_DIR}"
  echo "  Venv:        ${VENV_DIR}"
  echo "  Wrapper:     ${WRAPPER_PATH}"
  echo "  POS icon:    ${POS_DESKTOP_FILE}"
  echo "  Shortcut:    ${DESKTOP_FILE}"
  echo "  pywebview:   ${PYWEBVIEW_SPEC}"
  echo
  echo "Double-click app in POS folder: ${POS_DESKTOP_FILE}"
}

main() {
  parse_ubuntu_release
  choose_webkit_package
  install_os_dependencies
  ensure_uv_and_python
  build_frontend
  setup_pos_layout
  copy_runtime_sources
  setup_venv_and_python_deps
  run_migrations
  write_runtime_launcher
  write_wrapper
  write_desktop_shortcut
  print_summary
}

main "$@"
