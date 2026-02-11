#!/bin/bash

# git-branch-session.sh
# Creates and manages a Claude session-specific git branch
# Handles .git/index.lock by copying .git to /tmp and using GIT_DIR/GIT_WORK_TREE
#
# Usage:
#   source scripts/git-branch-session.sh "fix-email-agent"
#   # GIT_DIR and GIT_WORK_TREE are now exported and ready

set -e

DESCRIPTION="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Generate description if not provided
if [ -z "$DESCRIPTION" ]; then
    RANDOM_SUFFIX=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 6)
    DESCRIPTION="session-$(date +%s)-${RANDOM_SUFFIX}"
fi

# Create branch name: claude/YYYY-MM-DD-<description>
BRANCH_NAME="claude/$(date +%Y-%m-%d)-${DESCRIPTION}"

echo "================================================"
echo "Setting up session branch: $BRANCH_NAME"
echo "================================================"

# Step 1: Find the next available /tmp/unicorn-git-N directory
# This avoids conflicts when multiple sessions are running
N=0
while [ -d "/tmp/unicorn-git-$N" ]; do
    N=$((N + 1))
done
GIT_COPY="/tmp/unicorn-git-$N"

echo "[1/5] Copying .git to $GIT_COPY (handling index.lock)..."

# Copy .git directory
cp -r "${PROJECT_ROOT}/.git" "$GIT_COPY"

# Remove lock files that prevent git operations in sandbox
rm -f "$GIT_COPY/index.lock"

# Export environment variables so all git commands use our isolated copy
# This prevents "index.lock" permission errors
export GIT_DIR="$GIT_COPY"
export GIT_WORK_TREE="$PROJECT_ROOT"

echo "✓ Git directory isolated to $GIT_COPY"

# Step 2: Fetch origin/main to ensure we branch from latest
# This requires network access; if it fails, we fall back to local main
echo "[2/5] Fetching origin/main..."
if git fetch origin main 2>/dev/null; then
    BRANCH_SOURCE="origin/main"
    echo "✓ Fetched latest from origin/main"
else
    BRANCH_SOURCE="main"
    echo "⚠ Network fetch failed, branching from local main"
fi

# Step 3: Check if branch already exists
# If re-sourcing this script, just switch to the existing branch
echo "[3/5] Checking for existing branch..."
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "✓ Branch $BRANCH_NAME already exists, switching to it"
    git checkout "$BRANCH_NAME"
else
    # Create and check out the new branch
    echo "[4/5] Creating branch from $BRANCH_SOURCE..."
    git checkout -b "$BRANCH_NAME" "$BRANCH_SOURCE"
    echo "✓ Created and checked out $BRANCH_NAME"
fi

# Step 4: Verify we're on the correct branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "$BRANCH_NAME" ]; then
    echo "✗ Error: Failed to switch to $BRANCH_NAME (on $CURRENT_BRANCH)"
    exit 1
fi

echo "[5/5] Verification complete"
echo ""
echo "================================================"
echo "✓ Session branch ready: $BRANCH_NAME"
echo "  GIT_DIR=$GIT_DIR"
echo "  GIT_WORK_TREE=$GIT_WORK_TREE"
echo ""
echo "All git commands will use your session branch."
echo "Push to main when ready (or request code review)."
echo "================================================"
