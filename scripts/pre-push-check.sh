#!/usr/bin/env bash
#
# Pre-Push CI Check
# Replicates GitHub Actions CI environment locally to catch failures before pushing
#
# Usage: ./scripts/pre-push-check.sh
# Or setup as git hook: cp scripts/pre-push-check.sh .git/hooks/pre-push && chmod +x .git/hooks/pre-push

set -e  # Exit on any error

echo "🔍 Pre-Push CI Check"
echo "===================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall status
FAILED=0

# Function to run check and report status
run_check() {
    local name=$1
    local command=$2

    echo -e "${YELLOW}▶ Running: $name${NC}"

    if eval "$command"; then
        echo -e "${GREEN}✓ PASSED: $name${NC}"
        echo ""
    else
        echo -e "${RED}✗ FAILED: $name${NC}"
        echo ""
        FAILED=1
    fi
}

# Step 1: Clear all caches (critical for CI parity)
echo "🗑️  Clearing caches..."
if command -v pnpm &> /dev/null; then
    pnpm store prune || true
fi

# Clear turbo cache
if [ -d ".turbo" ]; then
    rm -rf .turbo
fi

# Clear node_modules/.cache
find . -type d -name ".cache" -path "*/node_modules/.cache" -exec rm -rf {} + 2>/dev/null || true

echo -e "${GREEN}✓ Caches cleared${NC}"
echo ""

# Step 2: Install dependencies (ensure lock file is up to date)
run_check "Install dependencies" "pnpm install --frozen-lockfile"

# Step 3: TypeCheck (with force flag to bypass cache)
run_check "TypeScript typecheck" "pnpm turbo typecheck --force"

# Step 4: Lint (if lint script exists)
if grep -q "\"lint\"" package.json 2>/dev/null; then
    run_check "Lint" "pnpm turbo lint --force"
fi

# Step 5: Tests (if test script exists)
if grep -q "\"test\"" package.json 2>/dev/null; then
    run_check "Tests" "pnpm turbo test --force"
fi

# Step 6: Build (if build script exists)
if grep -q "\"build\"" package.json 2>/dev/null; then
    run_check "Build" "pnpm turbo build --force"
fi

echo ""
echo "===================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! Safe to push.${NC}"
    exit 0
else
    echo -e "${RED}✗ Some checks failed. Fix issues before pushing.${NC}"
    exit 1
fi
