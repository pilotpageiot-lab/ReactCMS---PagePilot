#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ReactCMS — one-command startup
#
# Usage:
#   ./start.sh            → start everything (infra + API + dashboard)
#   ./start.sh backend    → start infra + API only
#   ./start.sh frontend   → start dashboard only (assumes API running)
#   ./start.sh stop       → stop all docker services
#   ./start.sh reset      → wipe volumes and start fresh
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/reactcms-backend"
FRONTEND_DIR="$SCRIPT_DIR/reactcms-dashboard"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'

info()    { echo -e "${BLUE}[ReactCMS]${NC} $1"; }
success() { echo -e "${GREEN}[ReactCMS]${NC} $1"; }
warn()    { echo -e "${YELLOW}[ReactCMS]${NC} $1"; }
error()   { echo -e "${RED}[ReactCMS]${NC} $1"; exit 1; }

# ── Dependency checks ────────────────────────────────────────────────────────
check_deps() {
  command -v node  >/dev/null 2>&1 || error "Node.js not found. Install from https://nodejs.org"
  command -v npm   >/dev/null 2>&1 || error "npm not found."
  command -v docker >/dev/null 2>&1 || error "Docker not found. Install from https://docker.com"
  docker compose version >/dev/null 2>&1 || docker-compose version >/dev/null 2>&1 || \
    error "docker compose not found."
  local node_ver
  node_ver=$(node -e "process.exit(parseInt(process.version.slice(1)) < 20 ? 1 : 0)" 2>/dev/null) || \
    warn "Node.js 20+ recommended. Current: $(node --version)"
}

# ── Backend .env setup ────────────────────────────────────────────────────────
setup_backend_env() {
  local env_file="$BACKEND_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    info "Creating $env_file from example..."
    cp "$BACKEND_DIR/.env.example" "$env_file"

    # Generate random JWT secrets
    local access_secret refresh_secret
    access_secret=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
    refresh_secret=$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")

    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/CHANGE_ME_access_secret_minimum_32_chars/$access_secret/" "$env_file"
      sed -i '' "s/CHANGE_ME_refresh_secret_minimum_32_chars/$refresh_secret/" "$env_file"
    else
      sed -i "s/CHANGE_ME_access_secret_minimum_32_chars/$access_secret/" "$env_file"
      sed -i "s/CHANGE_ME_refresh_secret_minimum_32_chars/$refresh_secret/" "$env_file"
    fi
    success "Generated .env with random JWT secrets"
  else
    info "Backend .env already exists — skipping"
  fi
}

# ── Frontend .env setup ───────────────────────────────────────────────────────
setup_frontend_env() {
  local env_file="$FRONTEND_DIR/.env"
  if [[ ! -f "$env_file" ]]; then
    cp "$FRONTEND_DIR/.env.example" "$env_file"
    success "Created frontend .env"
  fi
}

# ── Install backend deps ─────────────────────────────────────────────────────
install_backend() {
  info "Installing backend dependencies..."
  cd "$BACKEND_DIR"
  npm install --prefer-offline 2>/dev/null || npm install
  success "Backend dependencies ready"
}

# ── Install frontend deps ─────────────────────────────────────────────────────
install_frontend() {
  info "Installing frontend dependencies..."
  cd "$FRONTEND_DIR"
  npm install --prefer-offline 2>/dev/null || npm install
  success "Frontend dependencies ready"
}

# ── Start infrastructure ─────────────────────────────────────────────────────
start_infra() {
  info "Starting PostgreSQL and Redis..."
  cd "$BACKEND_DIR"
  docker compose up -d postgres redis

  info "Waiting for PostgreSQL to be healthy..."
  local retries=30
  while ! docker compose exec -T postgres pg_isready -U reactcms -d reactcms_dev -q 2>/dev/null; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && error "PostgreSQL failed to start after 30s"
    sleep 1
  done
  success "PostgreSQL ready"

  info "Waiting for Redis to be healthy..."
  retries=15
  while ! docker compose exec -T redis redis-cli ping -q 2>/dev/null | grep -q PONG; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && error "Redis failed to start after 15s"
    sleep 1
  done
  success "Redis ready"
}

# ── Run migrations ────────────────────────────────────────────────────────────
run_migrations() {
  info "Running database migrations..."
  cd "$BACKEND_DIR"
  npm run db:migrate
  success "Migrations complete"
}

# ── Run seed ──────────────────────────────────────────────────────────────────
run_seed() {
  info "Seeding demo data..."
  cd "$BACKEND_DIR"
  npm run db:seed
}

# ── Start API dev server ──────────────────────────────────────────────────────
start_api() {
  info "Starting API on http://localhost:3001 ..."
  cd "$BACKEND_DIR"
  npm run dev &
  API_PID=$!
  echo $API_PID > /tmp/reactcms-api.pid

  # Wait for API to be up
  local retries=20
  while ! curl -sf http://localhost:3001/health > /dev/null 2>&1; do
    retries=$((retries - 1))
    [[ $retries -eq 0 ]] && error "API failed to start after 20s"
    sleep 1
  done
  success "API ready at http://localhost:3001"
}

# ── Start frontend dev server ─────────────────────────────────────────────────
start_frontend() {
  info "Starting dashboard on http://localhost:5173 ..."
  cd "$FRONTEND_DIR"
  npm run dev &
  FRONTEND_PID=$!
  echo $FRONTEND_PID > /tmp/reactcms-frontend.pid
  success "Dashboard ready at http://localhost:5173"
}

# ── Stop ─────────────────────────────────────────────────────────────────────
stop_all() {
  info "Stopping services..."
  [[ -f /tmp/reactcms-api.pid ]] && kill "$(cat /tmp/reactcms-api.pid)" 2>/dev/null && rm /tmp/reactcms-api.pid
  [[ -f /tmp/reactcms-frontend.pid ]] && kill "$(cat /tmp/reactcms-frontend.pid)" 2>/dev/null && rm /tmp/reactcms-frontend.pid
  cd "$BACKEND_DIR" && docker compose down
  success "All services stopped"
}

# ── Reset ─────────────────────────────────────────────────────────────────────
reset_all() {
  warn "This will DELETE all data (volumes). Are you sure? (y/N)"
  read -r confirm
  [[ "$confirm" != "y" && "$confirm" != "Y" ]] && { info "Cancelled"; exit 0; }
  stop_all 2>/dev/null || true
  cd "$BACKEND_DIR" && docker compose down -v
  success "Volumes wiped"
}

# ── Cleanup on Ctrl+C ────────────────────────────────────────────────────────
cleanup() {
  echo ""
  warn "Shutting down..."
  [[ -f /tmp/reactcms-api.pid ]] && kill "$(cat /tmp/reactcms-api.pid)" 2>/dev/null && rm -f /tmp/reactcms-api.pid
  [[ -f /tmp/reactcms-frontend.pid ]] && kill "$(cat /tmp/reactcms-frontend.pid)" 2>/dev/null && rm -f /tmp/reactcms-frontend.pid
  exit 0
}
trap cleanup INT TERM

# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

MODE="${1:-all}"

case "$MODE" in
  stop)
    stop_all
    exit 0
    ;;
  reset)
    reset_all
    ;;
  backend)
    check_deps
    setup_backend_env
    install_backend
    start_infra
    run_migrations
    run_seed
    start_api
    echo ""
    success "═══════════════════════════════════════════════"
    success "  API running at  http://localhost:3001"
    success "  Health check:   http://localhost:3001/health"
    success "═══════════════════════════════════════════════"
    wait
    ;;
  frontend)
    check_deps
    setup_frontend_env
    install_frontend
    start_frontend
    echo ""
    success "Dashboard running at http://localhost:5173"
    wait
    ;;
  all|*)
    check_deps
    setup_backend_env
    setup_frontend_env
    install_backend
    install_frontend
    start_infra
    run_migrations
    run_seed
    start_api
    start_frontend
    echo ""
    success "═══════════════════════════════════════════════════════════"
    success "  ReactCMS is running!"
    success ""
    success "  Dashboard  →  http://localhost:5173"
    success "  API        →  http://localhost:3001"
    success ""
    success "  Demo credentials:"
    success "    Admin  → admin@reactcms.io  / Admin1234!"
    success "    User   → demo@example.mu    / Demo1234!"
    success ""
    success "  Press Ctrl+C to stop all services"
    success "═══════════════════════════════════════════════════════════"
    wait
    ;;
esac
