#!/bin/bash
# Redeploy all services on Dokploy
# Replace the SERVICE_IDs below with your actual webhook URLs from Dokploy

echo "🚀 Triggering redeployment for all services..."
echo ""

# Replace these with your actual webhook URLs from each service in Dokploy
# Format: http://213.199.57.111:3000/api/deploy/[SERVICE_ID]

echo "📦 Deploying cases-app-vtwo..."
# curl -X POST http://213.199.57.111:3000/api/deploy/Y7NEo8pVgTZ3rL4Idg650

echo "📦 Deploying finance-app..."
# curl -X POST http://213.199.57.111:3000/api/deploy/[FINANCE_SERVICE_ID]

echo "📦 Deploying forensic-app..."
# curl -X POST http://213.199.57.111:3000/api/deploy/[FORENSIC_SERVICE_ID]

echo "📦 Deploying legal-app..."
# curl -X POST http://213.199.57.111:3000/api/deploy/[LEGAL_SERVICE_ID]

echo "📦 Deploying insurance-app..."
# curl -X POST http://213.199.57.111:3000/api/deploy/[INSURANCE_SERVICE_ID]

echo ""
echo "✅ All deployment webhooks triggered!"
echo "🔍 Check Dokploy dashboard to monitor progress"
