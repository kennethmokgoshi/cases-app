#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy-dokploy.sh
# Creates and configures all 5 Zenowethu apps in Dokploy via REST API,
# then triggers their first deployment.
#
# Usage:
#   export DOKPLOY_URL="https://your-dokploy-domain.com"
#   export DOKPLOY_TOKEN="your-api-token"
#   export DOKPLOY_PROJECT_ID="your-project-id"
#   export GITHUB_REPO="https://github.com/kennethmokgoshi/cases-app.git"
#   export DATABASE_URL="postgresql://postgres:PASSWORD@HOST:5432/postgres"
#   export NEXTAUTH_SECRET="your-secret"
#   export OPENAI_API_KEY="sk-..."
#   export GHL_API_KEY="..."
#   export GHL_CLIENT_ID="..."
#   export SMTP_HOST="..."  SMTP_PORT="..."  SMTP_USER="..."  SMTP_PASSWORD="..."
#   export DHS_USERNAME="..."  DHS_PASSWORD="..."
#   bash scripts/deploy-dokploy.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Validate required env vars ────────────────────────────────────────────────
REQUIRED_VARS=(DOKPLOY_URL DOKPLOY_TOKEN DOKPLOY_PROJECT_ID GITHUB_REPO DATABASE_URL NEXTAUTH_SECRET OPENAI_API_KEY)
for VAR in "${REQUIRED_VARS[@]}"; do
  if [[ -z "${!VAR:-}" ]]; then
    echo "❌  Missing required env var: $VAR"
    exit 1
  fi
done

API="${DOKPLOY_URL}/api"
HEADERS=(-H "Authorization: Bearer ${DOKPLOY_TOKEN}" -H "Content-Type: application/json")

# ── Helper: call Dokploy API ──────────────────────────────────────────────────
dokploy() {
  local METHOD="$1"
  local ENDPOINT="$2"
  local BODY="${3:-}"
  if [[ -n "$BODY" ]]; then
    curl -s -X "$METHOD" "${API}/${ENDPOINT}" "${HEADERS[@]}" -d "$BODY"
  else
    curl -s -X "$METHOD" "${API}/${ENDPOINT}" "${HEADERS[@]}"
  fi
}

# ── App definitions ───────────────────────────────────────────────────────────
declare -A APP_NAME=( [cases]="cases-app-vtwo" [insurance]="insurance-app" [legal]="legal-app" [forensic-audit]="forensic-app" [finance]="finance-app" )
declare -A APP_DOMAIN=( [cases]="cases.zenowethu.co.za" [insurance]="insurance.zenowethu.co.za" [legal]="legal.zenowethu.co.za" [forensic-audit]="forensic.zenowethu.co.za" [finance]="accounts.zenowethu.co.za" )
APP_KEYS=(cases insurance legal forensic-audit finance)

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Zenowethu — Dokploy Deployment Script"
echo "  Target: ${DOKPLOY_URL}"
echo "════════════════════════════════════════════════════════════════"
echo ""

# ── Step 1: Verify connection ─────────────────────────────────────────────────
echo "▶  Verifying Dokploy connection..."
AUTH_CHECK=$(dokploy GET "auth.get")
if echo "$AUTH_CHECK" | grep -q "error\|Unauthorized"; then
  echo "❌  Cannot connect to Dokploy. Check DOKPLOY_URL and DOKPLOY_TOKEN."
  echo "    Response: $AUTH_CHECK"
  exit 1
fi
echo "✅  Connected to Dokploy"
echo ""

# ── Step 2: Create and configure each app ─────────────────────────────────────
declare -A APP_IDS

for APP_KEY in "${APP_KEYS[@]}"; do
  SERVICE_NAME="${APP_NAME[$APP_KEY]}"
  DOMAIN="${APP_DOMAIN[$APP_KEY]}"

  echo "────────────────────────────────────────────────────────────────"
  echo "  App: ${SERVICE_NAME}  (APP=${APP_KEY})"
  echo "  Domain: https://${DOMAIN}"
  echo "────────────────────────────────────────────────────────────────"

  # Create the application
  echo "  ▶  Creating application..."
  CREATE_RESP=$(dokploy POST "application.create" "{
    \"name\": \"${SERVICE_NAME}\",
    \"projectId\": \"${DOKPLOY_PROJECT_ID}\",
    \"description\": \"Zenowethu ${SERVICE_NAME} service\"
  }")

  APP_ID=$(echo "$CREATE_RESP" | grep -o '"applicationId":"[^"]*"' | cut -d'"' -f4)
  if [[ -z "$APP_ID" ]]; then
    # Service might already exist — try to find it
    APP_ID=$(echo "$CREATE_RESP" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  fi

  if [[ -z "$APP_ID" ]]; then
    echo "  ⚠️   Could not get application ID. Response: $CREATE_RESP"
    echo "       Skipping this app — configure manually in Dokploy UI."
    continue
  fi

  APP_IDS[$APP_KEY]="$APP_ID"
  echo "  ✅  Created — ID: ${APP_ID}"

  # Configure Git source + Dockerfile build
  echo "  ▶  Configuring build settings..."
  dokploy POST "application.update" "{
    \"applicationId\": \"${APP_ID}\",
    \"repository\": \"${GITHUB_REPO}\",
    \"branch\": \"main\",
    \"buildType\": \"dockerfile\",
    \"dockerfile\": \"./Dockerfile\",
    \"dockerContextPath\": \".\",
    \"dockerBuildStage\": \"runner\",
    \"buildArgs\": \"APP=${APP_KEY}\\nDATABASE_URL=${DATABASE_URL}\\nNEXTAUTH_SECRET=${NEXTAUTH_SECRET}\"
  }" > /dev/null
  echo "  ✅  Build config set (Dockerfile, APP=${APP_KEY})"

  # Set domain
  echo "  ▶  Setting domain..."
  dokploy POST "domain.create" "{
    \"applicationId\": \"${APP_ID}\",
    \"host\": \"${DOMAIN}\",
    \"port\": 3000,
    \"https\": true,
    \"certificateType\": \"letsencrypt\"
  }" > /dev/null
  echo "  ✅  Domain set: https://${DOMAIN}"

  # Set environment variables
  echo "  ▶  Setting environment variables..."
  ENV_VARS="DATABASE_URL=${DATABASE_URL}
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
AUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=https://${DOMAIN}
OPENAI_API_KEY=${OPENAI_API_KEY}
GHL_API_KEY=${GHL_API_KEY:-}
GHL_CLIENT_ID=${GHL_CLIENT_ID:-}
SMTP_HOST=${SMTP_HOST:-}
SMTP_PORT=${SMTP_PORT:-587}
SMTP_USER=${SMTP_USER:-}
SMTP_PASSWORD=${SMTP_PASSWORD:-}
SMTP_FROM=${SMTP_FROM:-noreply@zenowethu.co.za}
DHS_USERNAME=${DHS_USERNAME:-}
DHS_PASSWORD=${DHS_PASSWORD:-}
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1"

  # Escape for JSON
  ENV_ESCAPED=$(echo "$ENV_VARS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${ENV_VARS}\"")

  dokploy POST "application.saveEnvironment" "{
    \"applicationId\": \"${APP_ID}\",
    \"env\": ${ENV_ESCAPED}
  }" > /dev/null
  echo "  ✅  Environment variables set"

  echo ""
done

# ── Step 3: Trigger deployments ───────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Triggering deployments for all apps..."
echo "════════════════════════════════════════════════════════════════"
echo ""

for APP_KEY in "${APP_KEYS[@]}"; do
  APP_ID="${APP_IDS[$APP_KEY]:-}"
  if [[ -z "$APP_ID" ]]; then
    echo "  ⚠️   Skipping ${APP_NAME[$APP_KEY]} — no app ID recorded"
    continue
  fi

  echo "  ▶  Deploying ${APP_NAME[$APP_KEY]}..."
  DEPLOY_RESP=$(dokploy POST "application.deploy" "{\"applicationId\": \"${APP_ID}\"}")
  echo "  ✅  Deploy triggered — ${APP_NAME[$APP_KEY]}"
done

# ── Step 4: Print application IDs for GitHub secrets ─────────────────────────
echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Add these to GitHub → Settings → Secrets → Actions:"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "  DOKPLOY_URL          = ${DOKPLOY_URL}"
echo "  DOKPLOY_TOKEN        = ${DOKPLOY_TOKEN}"
for APP_KEY in "${APP_KEYS[@]}"; do
  APP_ID="${APP_IDS[$APP_KEY]:-NOT_CREATED}"
  SECRET_NAME="DOKPLOY_$(echo "$APP_KEY" | tr '[:lower:]-' '[:upper:]_')_ID"
  echo "  ${SECRET_NAME} = ${APP_ID}"
done

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "  Done. Monitor deployments at: ${DOKPLOY_URL}"
echo "════════════════════════════════════════════════════════════════"
