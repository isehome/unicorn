#!/bin/bash
#
# Git Safe Commit Wrapper
#
# Purpose: Prevent destructive commits from deleting untracked files when using git plumbing.
#
# Problem: When using git read-tree + update-index + write-tree + commit-tree,
# if you only add the files you modified, the resulting tree will DELETE all
# files that exist in HEAD but weren't explicitly added back to the tree.
#
# Solution: This script validates the commit before allowing it to be created.
#
# Usage:
#   scripts/git-safe-commit.sh <tree-sha> <parent-sha> <message> [--force]
#
# Example:
#   NEW_TREE=$(git write-tree)
#   COMMIT=$(scripts/git-safe-commit.sh "$NEW_TREE" "HEAD" "Fix: issue" | tail -1)

set -e

# Colors for output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Defaults
FORCE=false
VERBOSE=true

# Parse arguments
if [ $# -lt 3 ]; then
  echo -e "${RED}ERROR: Insufficient arguments${NC}"
  echo "Usage: scripts/git-safe-commit.sh <tree-sha> <parent-ref> <message> [--force]"
  echo ""
  echo "Arguments:"
  echo "  tree-sha       SHA of the tree to commit (output from git write-tree)"
  echo "  parent-ref     Parent commit reference (usually 'HEAD')"
  echo "  message        Commit message"
  echo "  --force        Override safety checks (optional)"
  exit 1
fi

TREE_SHA="$1"
PARENT_REF="$2"
COMMIT_MSG="$3"
[ "$4" = "--force" ] && FORCE=true

# Resolve parent to actual commit SHA
PARENT_SHA=$(git rev-parse "$PARENT_REF")

# Get HEAD tree for comparison
HEAD_TREE=$(git rev-parse "$PARENT_SHA^{tree}")

# Temporary file for diff
DIFF_FILE=$(mktemp)
trap "rm -f $DIFF_FILE" EXIT

# Compare trees and generate diff
git diff-tree "$HEAD_TREE" "$TREE_SHA" > "$DIFF_FILE" || true

# Count changes by type
ADDITIONS=$(grep -c '^:.*A$' "$DIFF_FILE" || echo 0)
MODIFICATIONS=$(grep -c '^:.*M$' "$DIFF_FILE" || echo 0)
DELETIONS=$(grep -c '^:.*D$' "$DIFF_FILE" || echo 0)

# Calculate line changes
ADDED_LINES=0
DELETED_LINES=0

# Get diff stat
if git diff-tree --numstat "$HEAD_TREE" "$TREE_SHA" > /tmp/numstat.txt 2>/dev/null; then
  while IFS=$'\t' read -r added deleted file; do
    [ -z "$added" ] && added=0
    [ -z "$deleted" ] && deleted=0
    ADDED_LINES=$((ADDED_LINES + added))
    DELETED_LINES=$((DELETED_LINES + deleted))
  done < /tmp/numstat.txt
fi

NET_DELETED=$((DELETED_LINES - ADDED_LINES))

# Print summary
echo ""
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "${BLUE}Git Safe Commit Validation${NC}"
echo -e "${BLUE}════════════════════════════════════════${NC}"
echo -e "Parent:      ${YELLOW}$(git rev-parse --short "$PARENT_SHA")${NC}"
echo -e "New Tree:    ${YELLOW}$(git rev-parse --short "$TREE_SHA")${NC}"
echo ""
echo -e "Changes:"
echo -e "  ${GREEN}+ Added:${NC}      $ADDITIONS files"
echo -e "  ${YELLOW}~ Modified:${NC}    $MODIFICATIONS files"
echo -e "  ${RED}✗ Deleted:${NC}     $DELETIONS files"
echo ""
echo -e "Lines of code:"
echo -e "  ${GREEN}+ Added:${NC}      $ADDED_LINES"
echo -e "  ${RED}- Deleted:${NC}     $DELETED_LINES"
echo -e "  Net:         $([ $NET_DELETED -gt 0 ] && echo -e "${RED}" || echo -e "${GREEN}")$NET_DELETED${NC} lines"
echo ""

# Safety checks
ABORT=false

if [ $DELETIONS -gt 3 ] && [ "$FORCE" = false ]; then
  echo -e "${RED}✗ ABORT: More than 3 files would be deleted ($DELETIONS files)${NC}"
  echo "   This suggests untracked files are being silently dropped."
  echo "   Use --force to override if this is intentional."
  ABORT=true
fi

if [ $NET_DELETED -gt 500 ] && [ "$FORCE" = false ]; then
  echo -e "${RED}✗ ABORT: More than 500 net lines of code would be deleted${NC}"
  echo "   Net deletion: $NET_DELETED lines"
  echo "   Use --force to override if this is intentional."
  ABORT=true
fi

if [ "$ABORT" = true ]; then
  echo ""
  echo -e "${RED}Commit rejected. Review your tree-building logic.${NC}"
  echo ""
  exit 1
fi

if [ "$FORCE" = true ]; then
  echo -e "${YELLOW}⚠ Safety checks overridden with --force${NC}"
  echo ""
fi

echo -e "${GREEN}✓ Safety checks passed${NC}"
echo ""

# Create the commit
COMMIT_SHA=$(git commit-tree "$TREE_SHA" -p "$PARENT_SHA" -m "$COMMIT_MSG")

echo -e "Commit created: ${GREEN}$COMMIT_SHA${NC}"
echo "$COMMIT_SHA"
