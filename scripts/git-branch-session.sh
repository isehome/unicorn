#!/bin/bash

# git-branch-session.sh
# Creates and manages a Claude session-specific git branch
# Handles .git/index.lock by copying .git to /tmp and using GIT_DIR/GIT_WORK_TREE
#
# IMPORTANT: Uses git plumbing to avoid `git checkout` which fails when the
# working directory has uncommitted changes (common in the sandbox environment).
#
# Usage:
#   source scripts/git-branch-session.sh "fix-email-agent"
#   # GIT_DIR and GIT_WORK_TREE are now exported and ready

# Don't use set -e when sourced — it would kill the caller's shell on error
# Instead we use explicit error checks

DESCRIPTION="${1:-}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Generate description if not provided
if [ -z "$DESCRIPTION" ]; then
    RANDOM_SUFFIX=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 6)
    DESCRIPTION="session-$(date +%s)-${RANDOM_SUFFIX}"
fi

# Sanitize description for use in branch name
DESCRIPTION=$(echo "$DESCRIPTION" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g')

# Create branch name: claude/YYYY-MM-DD-<description>
BRANCH_NAME="claude/$(date +%Y-%m-%d)-${DESCRIPTION}"

echo "================================================"
echo "Setting up session branch: $BRANCH_NAME"
echo "================================================"

# Step 1: Find the next available /tmp/unicorn-git-N directory
N=0
while [ -d "/tmp/unicorn-git-$N" ]; do
    N=$((N + 1))
done
GIT_COPY="/tmp/unicorn-git-$N"

echo "[1/5] Copying .git to $GIT_COPY (handling lock files)..."
cp -r "${PROJECT_ROOT}/.git" "$GIT_COPY"

# Remove ALL lock files — not just index.lock. HEAD.lock, refs locks, etc.
find "$GIT_COPY" -name "*.lock" -delete 2>/dev/null

export GIT_DIR="$GIT_COPY"
export GIT_WORK_TREE="$PROJECT_ROOT"

echo "✓ Git directory isolated to $GIT_COPY"

# Step 2: Fetch origin/main to ensure we branch from latest
echo "[2/5] Fetching origin/main..."
if git fetch origin main 2>/dev/null; then
    BRANCH_SOURCE="origin/main"
    echo "✓ Fetched latest from origin/main"
else
    BRANCH_SOURCE="main"
    echo "⚠ Network fetch failed, branching from local main"
fi

# Step 3: Get the commit SHA to branch from
SOURCE_SHA=$(git rev-parse "$BRANCH_SOURCE" 2>/dev/null)
if [ -z "$SOURCE_SHA" ]; then
    echo "✗ Error: Could not resolve $BRANCH_SOURCE"
    return 1 2>/dev/null || exit 1
fi
echo "[3/5] Branching from $BRANCH_SOURCE ($SOURCE_SHA)"

# Step 4: Create the branch using plumbing (no checkout needed)
# This avoids "your local changes would be overwritten" errors entirely.
# We just create a ref pointing to the same commit as origin/main.
BRANCH_REF="refs/heads/$BRANCH_NAME"

if git rev-parse --verify "$BRANCH_REF" >/dev/null 2>&1; then
    echo "✓ Branch $BRANCH_NAME already exists"
else
    # Create the branch ref directly
    git update-ref "$BRANCH_REF" "$SOURCE_SHA"
    echo "✓ Created branch $BRANCH_NAME"
fi

# Step 5: Point HEAD at our branch (like checkout but without touching working directory)
git symbolic-ref HEAD "$BRANCH_REF"

# Load the branch's tree into the index so commits work correctly.
# This reads the tree from origin/main into the index, then our working
# directory changes appear as modifications on top — exactly what we want.
git read-tree "$SOURCE_SHA"

echo "[5/5] HEAD now points to $BRANCH_NAME"
echo ""
echo "================================================"
echo "✓ Session branch ready: $BRANCH_NAME"
echo "  GIT_DIR=$GIT_DIR"
echo "  GIT_WORK_TREE=$GIT_WORK_TREE"
echo ""
echo "Your working directory is untouched."
echo "Stage and commit your changes, then push:"
echo "  git push origin $BRANCH_NAME"
echo ""
echo "Do NOT push to main. Use git-merge-branches.sh to merge."
echo "================================================"
# test
