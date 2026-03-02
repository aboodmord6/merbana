#!/usr/bin/env bash
# =============================================================================
#  build_pos.sh  —  Merbana full from-scratch build for Linux
# =============================================================================
#
#  Run once on the Linux machine from the project root:
#
#      bash Deployment/build_pos.sh
#
#  What it does
#  ------------
#  1. Detects your distro (Debian/Ubuntu · Fedora/RHEL · Arch)
#  2. Installs system packages  (Python 3, Node.js 20 LTS, GTK/WebKit)
#  3. Creates a Python venv  (.venv)  and installs pywebview + pyinstaller
#  4. npm ci  →  npm run build  (React SPA → dist/)
#  5. PyInstaller --onefile  →  single  Merbana  binary
#  6. Creates  ~/Desktop/POS/  and copies everything there
#
#  After the script finishes you will find on the Desktop:
#
#      ~/Desktop/POS/
#          Merbana          ← double-click to launch
#          dist/            ← bundled React build (also inside the binary)
#          data/            ← persistent app data (db.json)
# =============================================================================
set -euo pipefail

# ── Colour helpers ────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; RESET='\033[0m'
info()    { echo -e "${CYAN}▶  $*${RESET}"; }
success() { echo -e "${GREEN}✔  $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠  $*${RESET}"; }
die()     { echo -e "${RED}✗  $*${RESET}" >&2; exit 1; }

# ── Paths ─────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VENV_DIR="${PROJECT_ROOT}/.venv"
DIST_WEB="${PROJECT_ROOT}/dist"          # Vite output
POS_DIR="${HOME}/Desktop/POS"

echo ""
echo -e "${BOLD}=================================================================${RESET}"
echo -e "${BOLD}  Merbana — Linux Build & Install${RESET}"
echo -e "${BOLD}  Project : ${PROJECT_ROOT}${RESET}"
echo -e "${BOLD}  Output  : ${POS_DIR}${RESET}"
echo -e "${BOLD}=================================================================${RESET}"
echo ""

# ── 1. Detect package manager ─────────────────────────────────────────────────
info "Detecting Linux distribution …"

if command -v apt-get &>/dev/null; then
    PKG_MGR="apt"
elif command -v dnf &>/dev/null; then
    PKG_MGR="dnf"
elif command -v yum &>/dev/null; then
    PKG_MGR="yum"
elif command -v pacman &>/dev/null; then
    PKG_MGR="pacman"
else
    die "Unsupported package manager. Install packages manually (see script top)."
fi
success "Package manager: ${PKG_MGR}"

# ── Helper: install packages via the detected manager ────────────────────────
pkg_install() {
    case "${PKG_MGR}" in
        apt)     sudo apt-get install -y "$@" ;;
        dnf|yum) sudo "${PKG_MGR}" install -y "$@" ;;
        pacman)  sudo pacman -S --noconfirm "$@" ;;
    esac
}

# ── 2. System update + core tools ─────────────────────────────────────────────
info "Updating package lists …"
case "${PKG_MGR}" in
    apt)    sudo apt-get update -qq ;;
    dnf|yum) sudo "${PKG_MGR}" check-update -q || true ;;
    pacman) sudo pacman -Sy --noconfirm ;;
esac

info "Installing core system packages (curl, git, Python 3, pip, venv) …"
case "${PKG_MGR}" in
    apt)
        pkg_install curl git \
            python3 python3-pip python3-venv python3-dev \
            build-essential
        ;;
    dnf|yum)
        pkg_install curl git \
            python3 python3-pip python3-devel \
            gcc gcc-c++ make
        ;;
    pacman)
        pkg_install curl git python python-pip base-devel
        ;;
esac
success "Core packages installed."

# ── 3. WebKit2GTK / GTK (pywebview GTK backend) ───────────────────────────────
# Package names differ by distro version:
#   Ubuntu 24.04 / Debian 13  → webkitgtk-6.0   / gir1.2-webkitgtk-6.0
#   Ubuntu 22.04 / Debian 12  → webkit2gtk-4.1  / gir1.2-webkit2-4.1
#   Ubuntu 20.04 / Debian 11  → webkit2gtk-4.0  / gir1.2-webkit2-4.0
apt_pkg_exists() { apt-cache show "$1" &>/dev/null 2>&1; }

info "Installing GTK + WebKit2GTK system libraries …"
case "${PKG_MGR}" in
    apt)
        # Always install the GTK base and PyGObject bindings
        pkg_install \
            python3-gi python3-gi-cairo \
            gir1.2-gtk-3.0 \
            libgtk-3-dev \
            gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
            libglib2.0-dev

        # Detect the best available WebKit2GTK version
        if apt_pkg_exists "gir1.2-webkitgtk-6.0"; then
            info "  → Using WebKitGTK 6.0 (Ubuntu 24.04 / Debian 13)"
            pkg_install gir1.2-webkitgtk-6.0 libwebkitgtk-6.0-dev
        elif apt_pkg_exists "gir1.2-webkit2-4.1"; then
            info "  → Using WebKit2GTK 4.1 (Ubuntu 22.04 / Debian 12)"
            pkg_install gir1.2-webkit2-4.1 libwebkit2gtk-4.1-dev
        elif apt_pkg_exists "gir1.2-webkit2-4.0"; then
            info "  → Using WebKit2GTK 4.0 (Ubuntu 20.04 / Debian 11)"
            pkg_install gir1.2-webkit2-4.0 libwebkit2gtk-4.0-dev
        else
            warn "No WebKit2GTK dev package found in apt cache."
            warn "Try:  sudo add-apt-repository ppa:webkit-team/ppa  then re-run."
            warn "Continuing — pywebview will fall back to the browser launcher."
        fi
        ;;
    dnf|yum)
        # Fedora 38+: webkit2gtk4.1;  older: webkit2gtk3
        if "${PKG_MGR}" info webkit2gtk4.1 &>/dev/null 2>&1; then
            pkg_install python3-gobject python3-cairo gobject-introspection \
                webkit2gtk4.1 webkit2gtk4.1-devel gtk3 gtk3-devel
        else
            pkg_install python3-gobject python3-cairo gobject-introspection \
                webkit2gtk3 webkit2gtk3-devel gtk3 gtk3-devel
        fi
        ;;
    pacman)
        # Arch always ships the latest; try 4.1 then 4.0
        if pacman -Ss "^webkit2gtk-4.1$" &>/dev/null 2>&1; then
            pkg_install python-gobject webkit2gtk-4.1 gtk3
        else
            pkg_install python-gobject webkit2gtk gtk3
        fi
        ;;
esac
success "WebKit2GTK libraries installed."

# ── 4. Node.js 20 LTS ─────────────────────────────────────────────────────────
install_nodejs() {
    info "Installing Node.js 20 LTS …"
    case "${PKG_MGR}" in
        apt)
            # NodeSource setup
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
            ;;
        dnf|yum)
            curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo -E bash -
            sudo "${PKG_MGR}" install -y nodejs
            ;;
        pacman)
            sudo pacman -S --noconfirm nodejs npm
            ;;
    esac
}

if command -v node &>/dev/null; then
    NODE_VER=$(node --version | sed 's/v//')
    NODE_MAJOR=$(echo "${NODE_VER}" | cut -d. -f1)
    if [[ "${NODE_MAJOR}" -lt 18 ]]; then
        warn "Node.js ${NODE_VER} is too old (need ≥ 18). Re-installing …"
        install_nodejs
    else
        success "Node.js ${NODE_VER} is OK."
    fi
else
    install_nodejs
fi
success "Node.js $(node --version)  /  npm $(npm --version)"

# ── 5. Python virtual environment ─────────────────────────────────────────────
info "Setting up Python virtual environment at ${VENV_DIR} …"
if [[ ! -d "${VENV_DIR}" ]]; then
    python3 -m venv "${VENV_DIR}"
fi

# Activate venv for the rest of this script
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"
success "venv activated: $(python --version)"

# ── 6. Python packages ────────────────────────────────────────────────────────
info "Installing Python packages (pywebview, pyinstaller) …"
pip install --quiet --upgrade pip
pip install --quiet \
    "pywebview>=5.0" \
    "pyinstaller>=6.0" \
    "pyinstaller-hooks-contrib>=2024.0"
success "Python packages installed."

# ── 7. Node dependencies ──────────────────────────────────────────────────────
info "Installing Node.js dependencies …"
cd "${PROJECT_ROOT}"
npm ci --silent
success "Node packages installed."

# ── 8. Build React frontend ────────────────────────────────────────────────────
info "Building React frontend …"
npm run build
[[ -f "${DIST_WEB}/index.html" ]] || die "Frontend build failed: dist/index.html not found."
success "React build OK."

# ── 9. PyInstaller — compile to single binary ─────────────────────────────────
info "Compiling launcher with PyInstaller …"

OUT_PYINSTALLER="${PROJECT_ROOT}/dist_linux"
BUILD_WORK="${PROJECT_ROOT}/_pyinstaller_work"
SPEC_FILE="${PROJECT_ROOT}/Merbana.spec"
LAUNCHER="${PROJECT_ROOT}/Deployment/merbana_launcher.py"

[[ -f "${LAUNCHER}" ]] || die "merbana_launcher.py not found. Did you run from the project root?"

# Clean previous artefacts
rm -rf "${OUT_PYINSTALLER}" "${BUILD_WORK}" "${SPEC_FILE}"

python -m PyInstaller \
    --onefile \
    --noconsole \
    --add-data "${DIST_WEB}:dist" \
    --name "Merbana" \
    --distpath "${OUT_PYINSTALLER}" \
    --workpath "${BUILD_WORK}" \
    --specpath "${PROJECT_ROOT}" \
    --hidden-import "webview" \
    --hidden-import "webview.http" \
    --hidden-import "webview.platforms.gtk" \
    --hidden-import "webview.platforms.qt" \
    --hidden-import "gi" \
    --hidden-import "gi.repository.Gtk" \
    --hidden-import "gi.repository.WebKit2" \
    --hidden-import "gi.repository.WebKit" \
    "${LAUNCHER}"

BINARY="${OUT_PYINSTALLER}/Merbana"
[[ -f "${BINARY}" ]] || die "Binary not found after PyInstaller run."
chmod +x "${BINARY}"
success "Binary compiled: ${BINARY}"

# ── 10. Assemble ~/Desktop/POS ────────────────────────────────────────────────
info "Assembling output directory: ${POS_DIR} …"

mkdir -p "${POS_DIR}"

# Copy binary
cp "${BINARY}" "${POS_DIR}/Merbana"
chmod +x "${POS_DIR}/Merbana"

# Copy the React dist folder (redundant for runtime, handy for inspection / dev)
rm -rf "${POS_DIR}/dist"
cp -r "${DIST_WEB}" "${POS_DIR}/dist"

# Copy persistent data folder (db.json lives here at runtime)
DATA_SRC="${PROJECT_ROOT}/public/data"
if [[ -d "${DATA_SRC}" ]]; then
    rm -rf "${POS_DIR}/data"
    cp -r "${DATA_SRC}" "${POS_DIR}/data"
fi

success "Output assembled."

# ── 11. .desktop shortcut for the app launcher ────────────────────────────────
DESKTOP_ENTRY="${HOME}/Desktop/Merbana.desktop"
cat > "${DESKTOP_ENTRY}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Merbana - إدارة الطلبات
Comment=Merbana Order Management System
Exec=${POS_DIR}/Merbana
Icon=${POS_DIR}/dist/favicon.ico
Terminal=false
Categories=Office;
StartupWMClass=Merbana
EOF
chmod +x "${DESKTOP_ENTRY}"

# Trust the .desktop file on GNOME (gio) — ignore errors silently
gio set "${DESKTOP_ENTRY}" metadata::trusted true 2>/dev/null || true
success "Desktop shortcut created: ${DESKTOP_ENTRY}"

# ── 12. Clean up build artefacts ──────────────────────────────────────────────
info "Cleaning up build artefacts …"
rm -rf "${OUT_PYINSTALLER}" "${BUILD_WORK}" "${SPEC_FILE}"
success "Clean."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=================================================================${RESET}"
echo -e "${GREEN}${BOLD}  ✅  Build complete!${RESET}"
echo ""
echo -e "  Binary  : ${POS_DIR}/Merbana"
echo -e "  Dist    : ${POS_DIR}/dist/"
echo -e "  Data    : ${POS_DIR}/data/"
echo -e "  Shortcut: ${DESKTOP_ENTRY}"
echo ""
echo -e "  Launch with:   ${POS_DIR}/Merbana"
echo -e "  Or double-click 'Merbana' on the Desktop."
echo -e "${BOLD}=================================================================${RESET}"
echo ""
