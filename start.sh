#!/usr/bin/env bash
# =============================================================================
#  SAKILA 360 — Script de démarrage complet
#  Usage : chmod +x start.sh && ./start.sh
# =============================================================================
set -e

GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

log()  { echo -e "${CYAN}[Sakila 360]${NC} $1"; }
ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC}  $1"; }
err()  { echo -e "${RED}✗${NC}  $1"; exit 1; }

echo ""
echo -e "${CYAN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       SAKILA 360 — Data Warehouse         ║${NC}"
echo -e "${CYAN}║   Star Schema · ETL Python · React UI     ║${NC}"
echo -e "${CYAN}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ── Vérifications préalables ─────────────────────────────────────────────────
command -v docker      >/dev/null 2>&1 || err "Docker n'est pas installé"
command -v docker compose version >/dev/null 2>&1 || \
  command -v docker-compose >/dev/null 2>&1 || err "Docker Compose n'est pas installé"
ok "Docker et Docker Compose détectés"

# ── Télécharger les dumps Sakila si absents ───────────────────────────────────
log "Vérification des fichiers Sakila source..."

SAKILA_SCHEMA="init/sakila-schema.sql"
SAKILA_DATA="init/sakila-data.sql"

if [ ! -f "$SAKILA_SCHEMA" ] || [ ! -f "$SAKILA_DATA" ]; then
  log "Téléchargement de la base Sakila depuis le dépôt officiel MySQL..."

  curl -fsSL \
    "https://downloads.mysql.com/docs/sakila-db.tar.gz" \
    -o /tmp/sakila.tar.gz 2>/dev/null || \
  curl -fsSL \
    "https://raw.githubusercontent.com/jOOQ/sakila/main/mysql-sakila-db/mysql-sakila-schema.sql" \
    -o "$SAKILA_SCHEMA" 2>/dev/null

  # Essai avec le tarball officiel
  if [ -f /tmp/sakila.tar.gz ]; then
    tar -xzf /tmp/sakila.tar.gz -C /tmp/
    cp /tmp/sakila-db/sakila-schema.sql "$SAKILA_SCHEMA"
    cp /tmp/sakila-db/sakila-data.sql   "$SAKILA_DATA"
    rm -rf /tmp/sakila.tar.gz /tmp/sakila-db
    ok "Sakila téléchargé depuis MySQL officiel"
  else
    # Fallback GitHub jOOQ
    curl -fsSL \
      "https://raw.githubusercontent.com/jOOQ/sakila/main/mysql-sakila-db/mysql-sakila-insert-data.sql" \
      -o "$SAKILA_DATA" 2>/dev/null
    ok "Sakila téléchargé depuis GitHub (jOOQ)"
  fi
else
  ok "Fichiers Sakila déjà présents"
fi

# ── Build et démarrage ────────────────────────────────────────────────────────
log "Construction et démarrage des containers..."
docker compose up --build -d db_source db_dwh

log "Attente de la disponibilité des bases de données (30-60s)..."
sleep 5

# Polling santé des deux BDD
for svc in sakila_source sakila_dwh; do
  log "Attente de $svc..."
  until docker inspect --format='{{.State.Health.Status}}' "$svc" 2>/dev/null | grep -q "healthy"; do
    printf "."
    sleep 3
  done
  echo ""
  ok "$svc est prêt"
done

log "Lancement du pipeline ETL..."
docker compose up --build etl
echo ""
ok "ETL terminé"

log "Démarrage de l'API et du dashboard..."
docker compose up -d api dashboard

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║            DÉPLOIEMENT RÉUSSI ✓           ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  🌐  Dashboard  : ${CYAN}http://localhost:3000${NC}"
echo -e "  🔌  API        : ${CYAN}http://localhost:4000${NC}"
echo -e "  🗄️   DWH MySQL  : ${CYAN}localhost:3307${NC}  (dwh_user / dwh_pass)"
echo -e "  🗄️   Source MySQL: ${CYAN}localhost:3306${NC}  (sakila_user / sakila_pass)"
echo ""
echo -e "  Pour arrêter  : ${YELLOW}docker compose down${NC}"
echo -e "  Pour les logs : ${YELLOW}docker compose logs -f${NC}"
echo ""
