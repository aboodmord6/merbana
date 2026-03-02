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
#  1.  Detects your distro (Debian/Ubuntu · Fedora/RHEL · Arch)
#  2.  Installs system packages  (Python 3, Node.js 20 LTS, GTK/WebKit2GTK)
#  3.  Builds the React SPA  (npm ci → npm run build → dist/)
#  4.  Creates ~/Desktop/POS/ with:
#          dist/          ← React build served at runtime
#          data/          ← persistent db.json
#          app/
#            merbana_launcher.py
#            venv/        ← Python venv (--system-site-packages so gi works)
#          Merbana        ← shell wrapper — double-click this!
#  5.  Creates a .desktop launcher icon on the Desktop
#
#  NOTE: Safe to run as root — output lands on the real user's Desktop.
#
#  WHY NO PyInstaller?
#  gi/WebKit2GTK is a system library (.so + GObject typelibs). PyInstaller
#  cannot bundle it. The shell-wrapper + venv is the standard Linux approach.
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

# ── Resolve the REAL user's Desktop even when running as root ─────────────────
# Priority: SUDO_USER  →  PKEXEC_UID  →  last non-root login  →  current $HOME
if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    REAL_USER="${SUDO_USER}"
elif [[ -n "${PKEXEC_UID:-}" ]]; then
    REAL_USER="$(id -un "${PKEXEC_UID}")"
elif id -nu 1000 &>/dev/null 2>&1; then
    REAL_USER="$(id -nu 1000)"
else
    REAL_USER="$(logname 2>/dev/null || echo "${USER}")"
fi

REAL_HOME=$(getent passwd "${REAL_USER}" | cut -d: -f6)
[[ -z "${REAL_HOME}" ]] && REAL_HOME="${HOME}"

POS_DIR="${REAL_HOME}/Desktop/POS"

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

# WEBKIT_VER is used later to pin pywebview and set PyInstaller hidden imports
WEBKIT_VER="4.0"   # default / safest assumption

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
            WEBKIT_VER="6.0"
        elif apt_pkg_exists "gir1.2-webkit2-4.1"; then
            info "  → Using WebKit2GTK 4.1 (Ubuntu 22.04 / Debian 12)"
            pkg_install gir1.2-webkit2-4.1 libwebkit2gtk-4.1-dev
            WEBKIT_VER="4.1"
        elif apt_pkg_exists "gir1.2-webkit2-4.0"; then
            info "  → Using WebKit2GTK 4.0 (Ubuntu 20.04 / Debian 11)"
            pkg_install gir1.2-webkit2-4.0 libwebkit2gtk-4.0-dev
            WEBKIT_VER="4.0"
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
            WEBKIT_VER="4.1"
        else
            pkg_install python3-gobject python3-cairo gobject-introspection \
                webkit2gtk3 webkit2gtk3-devel gtk3 gtk3-devel
            WEBKIT_VER="4.0"
        fi
        ;;
    pacman)
        # Arch always ships the latest; try 4.1 then 4.0
        if pacman -Ss "^webkit2gtk-4.1$" &>/dev/null 2>&1; then
            pkg_install python-gobject webkit2gtk-4.1 gtk3
            WEBKIT_VER="4.1"
        else
            pkg_install python-gobject webkit2gtk gtk3
            WEBKIT_VER="4.0"
        fi
        ;;
esac
success "WebKit2GTK ${WEBKIT_VER} libraries installed."

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

# ── 5. Node dependencies + React build ────────────────────────────────────────
info "Installing Node.js dependencies …"
cd "${PROJECT_ROOT}"
npm ci --silent
success "Node packages installed."

info "Building React frontend …"
npm run build
[[ -f "${DIST_WEB}/index.html" ]] || die "Frontend build failed: dist/index.html not found."
success "React build OK."

# ── 6. Create POS directory structure ─────────────────────────────────────────
APP_DIR="${POS_DIR}/app"
VENV_APP="${APP_DIR}/venv"

info "Creating ${POS_DIR} structure …"
mkdir -p "${APP_DIR}"

# ── 7. Python venv with --system-site-packages ────────────────────────────────
# gi / WebKit2GTK are SYSTEM libraries — they cannot go inside a venv.
# --system-site-packages makes the venv inherit them from the system Python,
# while keeping pywebview isolated inside the venv.
info "Creating Python venv at ${VENV_APP} …"
python3 -m venv --system-site-packages --clear "${VENV_APP}"
success "venv created."

source "${VENV_APP}/bin/activate"

info "Installing pywebview into venv …"
"${VENV_APP}/bin/pip" install --quiet --upgrade pip

if [[ "${WEBKIT_VER}" == "4.0" ]]; then
    PYWEBVIEW_SPEC="pywebview>=4.0,<5.0"
    info "  → WebKit 4.0: pinning pywebview < 5.0"
else
    PYWEBVIEW_SPEC="pywebview>=5.0"
fi
"${VENV_APP}/bin/pip" install --quiet "${PYWEBVIEW_SPEC}"
success "pywebview installed (${PYWEBVIEW_SPEC})."
deactivate

# ── 8. Copy files into POS/ ───────────────────────────────────────────────────
info "Copying dist/ …"
rm -rf "${POS_DIR}/dist"
cp -r "${DIST_WEB}" "${POS_DIR}/dist"
success "dist/ copied."

DATA_SRC="${PROJECT_ROOT}/public/data"
if [[ -d "${DATA_SRC}" ]]; then
    info "Copying data/ …"
    rm -rf "${POS_DIR}/data"
    cp -r "${DATA_SRC}" "${POS_DIR}/data"
    success "data/ copied."
fi

LAUNCHER_SRC="${PROJECT_ROOT}/Deployment/merbana_launcher.py"
[[ -f "${LAUNCHER_SRC}" ]] || die "merbana_launcher.py not found."
cp "${LAUNCHER_SRC}" "${APP_DIR}/merbana_launcher.py"
success "Launcher script copied."

# ── 9. Shell wrapper: POS/Merbana ─────────────────────────────────────────────
# This IS what the user runs.  It activates the venv (which can see system
# gi/WebKit2GTK via --system-site-packages) then launches merbana_launcher.py.
WRAPPER="${POS_DIR}/Merbana"
cat > "${WRAPPER}" <<'WRAPPER_EOF'
#!/usr/bin/env bash
SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${SELF_DIR}/app/venv"
LAUNCHER="${SELF_DIR}/app/merbana_launcher.py"

if [[ ! -f "${VENV}/bin/python" ]]; then
    echo "ERROR: venv not found at ${VENV}" >&2
    exit 1
fi

export MERBANA_DIST_PATH="${SELF_DIR}/dist"
exec "${VENV}/bin/python" "${LAUNCHER}"
WRAPPER_EOF
chmod +x "${WRAPPER}"
success "Shell wrapper created: ${WRAPPER}"

# ── 10. .desktop shortcut ─────────────────────────────────────────────────────
DESKTOP_ENTRY="${REAL_HOME}/Desktop/Merbana.desktop"

ICON=""
for candidate in \
    "${POS_DIR}/dist/favicon.ico" \
    "${POS_DIR}/dist/favicon.png" \
    "${POS_DIR}/dist/assets/logo.png"; do
    if [[ -f "${candidate}" ]]; then ICON="${candidate}"; break; fi
done

cat > "${DESKTOP_ENTRY}" <<EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=Merbana - إدارة الطلبات
Comment=Merbana Order Management System
Exec=${WRAPPER}
Icon=${ICON}
Terminal=false
Categories=Office;
StartupWMClass=Merbana
EOF
chmod +x "${DESKTOP_ENTRY}"
gio set "${DESKTOP_ENTRY}" metadata::trusted true 2>/dev/null || true
success "Desktop shortcut: ${DESKTOP_ENTRY}"

# ── 11. Fix ownership ─────────────────────────────────────────────────────────
if [[ "${EUID}" -eq 0 && "${REAL_USER}" != "root" ]]; then
    info "Fixing ownership of ${POS_DIR} → ${REAL_USER} …"
    chown -R "${REAL_USER}:${REAL_USER}" "${POS_DIR}" 2>/dev/null || chown -R "${REAL_USER}" "${POS_DIR}"
    chown "${REAL_USER}:${REAL_USER}" "${DESKTOP_ENTRY}" 2>/dev/null || chown "${REAL_USER}" "${DESKTOP_ENTRY}"
    success "Ownership fixed."
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}=================================================================${RESET}"
echo -e "${GREEN}${BOLD}  ✅  Build complete!${RESET}"
echo ""
echo -e "  POS folder : ${POS_DIR}/"
echo -e "    Merbana  : run this  (or double-click the Desktop icon)"
echo -e "    dist/    : React build"
echo -e "    data/    : persistent data"
echo -e "    app/     : Python launcher + venv"
echo ""
echo -e "  Run:  bash ${WRAPPER}"
echo -e "  Or double-click 'Merbana' on the Desktop."
echo -e "${BOLD}=================================================================${RESET}"
echo ""
