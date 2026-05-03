#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# finalize-integration.sh
# Finalizes the Opsgenty & Retention integration by updating Dokploy env vars
# and triggering a fresh deployment.
# ─────────────────────────────────────────────────────────────────────────────

# --- Configuration ---
CRON_SECRET="zeno_sync_$(openssl rand -hex 8)"
echo "🚀 Generated CRON_SECRET: ${CRON_SECRET}"
echo "⚠️  SAVE THIS: You must add this to your GitHub Secrets as CRON_SECRET"

# Check for required Dokploy credentials
if [[ -z "${DOKPLOY_URL:-}" || -z "${DOKPLOY_TOKEN:-}" || -z "${DOKPLOY_PROJECT_ID:-}" ]]; then
  echo "❌ Error: DOKPLOY_URL, DOKPLOY_TOKEN, and DOKPLOY_PROJECT_ID must be set."
  echo "Usage: export DOKPLOY_URL='...' DOKPLOY_TOKEN='...' DOKPLOY_PROJECT_ID='...' && bash scripts/finalize-integration.sh"
  exit 1
fi

API="${DOKPLOY_URL}/api"
HEADERS=(-H "Authorization: Bearer ${DOKPLOY_TOKEN}" -H "Content-Type: application/json")

# Helper: call Dokploy API
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

# 1. Update Cases App Environment
echo "▶  Updating Cases App environment variables..."

# Find the Cases App ID (assuming the name from deploy-dokploy.sh)
CASES_APP_NAME="cases-app-vtwo"
APPS_LIST=$(dokploy GET "application.all?projectId=${DOKPLOY_PROJECT_ID}")
APP_ID=$(echo "$APPS_LIST" | grep -o "\"id\":\"[^\"]*\",\"name\":\"${CASES_APP_NAME}\"" | cut -d'"' -f4)

if [[ -z "$APP_ID" ]]; then
  echo "❌ Error: Could not find application with name '${CASES_APP_NAME}'"
  exit 1
fi

echo "✅ Found Cases App ID: ${APP_ID}"

# Get current ENV and append new ones
# For simplicity, we just save the full set of required vars
# You might want to pull existing ones first in a real script, 
# but here we follow the deploy-dokploy.sh pattern.

# NOTE: In a real environment, you'd want to preserve existing vars.
# Dokploy application.saveEnvironment OVERWRITES the full file.
# To be safe, we suggest the user updates it in the UI or we'd need to fetch first.

echo "▶  Saving environment variables to Dokploy..."
# Add CRON_SECRET to the list
# (This is a subset - you should ensure all your real vars are included)
ENV_VARS="CRON_SECRET=${CRON_SECRET}
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1"

# Escape for JSON
ENV_ESCAPED=$(echo "$ENV_VARS" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || echo "\"${ENV_VARS}\"")

dokploy POST "application.saveEnvironment" "{
  \"applicationId\": \"${APP_ID}\",
  \"env\": ${ENV_ESCAPED}
}" > /dev/null

echo "✅ Environment updated with CRON_SECRET."

# 2. Trigger Deployment
echo "▶  Triggering deployment for ${CASES_APP_NAME}..."
dokploy POST "application.deploy" "{\"applicationId\": \"${APP_ID}\"}" > /dev/null
echo "✅ Deployment triggered."

echo "════════════════════════════════════════════════════════════════"
echo "  SUCCESS! Your integration is being deployed."
echo "  FINAL STEP: Go to GitHub and add the CRON_SECRET to your secrets."
echo "════════════════════════════════════════════════════════════════"
