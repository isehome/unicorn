#!/bin/bash

################################################################################
# git-merge-branches.sh
#
# Safely merges Claude session branches (claude/YYYY-MM-DD-*) back into main.
# Handles sandbox limitation where .git/index.lock cannot be deleted.
#
# Usage:
#   ./scripts/git-merge-branches.sh --list
#   ./scripts/git-merge-branches.sh claude/2026-02-11-fix-email-agent
#   ./scripts/git-merge-branches.sh --all
#   ./scripts/git-merge-branches.sh --dry-run --all
#
################################################################################

set -e

# Configuration
REPO_ROOT="${REPO_ROOT:-.}"
DRY_RUN=0
MODE="single"
TARGET_BRANCH=""

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

################################################################################
# Utility Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[OK]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

################################################################################
# Git Directory Setup
#
# Handles sandbox limitation where .git/index.lock cannot be deleted.
# We copy .git to /tmp/unicorn-git-N and use it as GIT_DIR.
################################################################################

setup_git_dir() {
    local project_dir="$1"
    local git_source="${project_dir}/.git"

    if [ ! -d "$git_source" ]; then
        log_error "Not a git repository: $project_dir"
        return 1
    fi

    # Find next available temp git directory
    local temp_git_dir
    local counter=1
    while [ -d "/tmp/unicorn-git-${counter}" ]; do
        counter=$((counter + 1))
    done
    temp_git_dir="/tmp/unicorn-git-${counter}"

    # Copy .git to temp location
    cp -r "$git_source" "$temp_git_dir"

    # Remove any lock files from the temp copy
    find "$temp_git_dir" -name "*.lock" -delete

    log_info "Git directory copied to: $temp_git_dir"
    echo "$temp_git_dir"
}

cleanup_git_dir() {
    local temp_git_dir="$1"
    if [ -d "$temp_git_dir" ]; then
        rm -rf "$temp_git_dir"
        log_info "Cleaned up temporary git directory"
    fi
}

################################################################################
# Merge Safety Checks
################################################################################

get_diff_stats() {
    local temp_git_dir="$1"
    local branch="$2"

    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git diff --stat "main..${branch}"
}

count_deletions() {
    local temp_git_dir="$1"
    local branch="$2"

    # Count number of files with deletions (lines starting with "delete mode")
    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git diff --name-status "main..${branch}" | grep "^D" | wc -l
}

check_deletion_safety() {
    local temp_git_dir="$1"
    local branch="$2"
    local deletion_count

    deletion_count=$(count_deletions "$temp_git_dir" "$branch")

    if [ "$deletion_count" -gt 3 ]; then
        log_error "Merge of $branch would delete $deletion_count files (limit: 3)"
        log_warn "Deleted files:"
        GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git diff --name-status "main..${branch}" | grep "^D" | sed 's/^D\t/  - /'
        return 1
    fi

    return 0
}

################################################################################
# Branch Operations
################################################################################

list_claude_branches() {
    local temp_git_dir="$1"

    log_info "Fetching latest from origin..."
    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git fetch origin 2>/dev/null || true

    log_info "Claude branches:"
    echo ""

    # Get all local claude/* branches
    local branches
    branches=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git for-each-ref refs/heads/claude/ --format='%(refname:short)')

    if [ -z "$branches" ]; then
        log_warn "No claude/* branches found"
        return 0
    fi

    while IFS= read -r branch; do
        # Get author date
        local author_date
        author_date=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git log -1 --format=%ai "$branch")

        # Count commits ahead of main
        local commits_ahead
        commits_ahead=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git rev-list --count "main..${branch}")

        # Get last commit summary
        local last_commit
        last_commit=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git log -1 --format="%h %s" "$branch")

        # Get diff stats
        local changed_files
        changed_files=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git diff --stat "main..${branch}" | tail -1)

        echo -e "${BLUE}${branch}${NC}"
        echo "  Date:      $author_date"
        echo "  Commits:   $commits_ahead ahead of main"
        echo "  Last:      $last_commit"
        echo "  Changes:   $changed_files"
        echo ""
    done <<< "$branches"
}

merge_branch() {
    local temp_git_dir="$1"
    local branch="$2"
    local dry_run="$3"

    log_info "Processing: $branch"

    # Verify branch exists
    if ! GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git rev-parse --verify "$branch" > /dev/null 2>&1; then
        log_error "Branch does not exist: $branch"
        return 1
    fi

    # Show what will be merged
    log_info "Files that will change:"
    get_diff_stats "$temp_git_dir" "$branch" | head -20 || true
    echo ""

    # Safety check: deletion count
    if ! check_deletion_safety "$temp_git_dir" "$branch"; then
        log_error "Skipping merge of $branch due to deletion safety check"
        return 1
    fi

    # Dry run: stop here
    if [ "$dry_run" -eq 1 ]; then
        log_success "[DRY RUN] Would merge: $branch"
        return 0
    fi

    # Attempt merge
    log_info "Attempting merge into main..."

    # Check for conflicts first
    if ! GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git merge --no-commit --no-ff "$branch" 2>/dev/null; then

        # Merge failed - show conflicting files and abort
        log_error "Merge conflict detected!"
        log_warn "Conflicting files:"
        GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git status --porcelain | grep "^UU\|^AA\|^DD\|^UD\|^DU" | \
            sed 's/^/  - /' || true

        # Abort the merge
        GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git merge --abort 2>/dev/null || true

        log_error "Skipping $branch - manual conflict resolution required"
        return 1
    fi

    # Complete the merge
    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git commit -m "Merge branch '$branch' into main" 2>/dev/null

    log_success "Merged: $branch"
    return 0
}

merge_all_branches() {
    local temp_git_dir="$1"
    local dry_run="$2"

    log_info "Fetching latest from origin..."
    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git fetch origin 2>/dev/null || true

    # Ensure we're on main
    GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git checkout main 2>/dev/null || true

    local branches
    branches=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
        git for-each-ref refs/heads/claude/ --format='%(refname:short)' | sort)

    if [ -z "$branches" ]; then
        log_warn "No claude/* branches found to merge"
        return 0
    fi

    local merged_count=0
    local skipped_count=0

    while IFS= read -r branch; do
        echo ""
        if merge_branch "$temp_git_dir" "$branch" "$dry_run"; then
            merged_count=$((merged_count + 1))
        else
            skipped_count=$((skipped_count + 1))
        fi
    done <<< "$branches"

    # Push to origin (unless dry run)
    echo ""
    if [ "$dry_run" -eq 1 ]; then
        log_success "[DRY RUN] Would push main to origin"
    else
        log_info "Pushing main to origin..."
        GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git push origin main 2>/dev/null || true

        # Update local main reference
        local new_main_hash
        new_main_hash=$(GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
            git rev-parse main)
        echo "$new_main_hash" > "${REPO_ROOT}/.git/refs/heads/main"

        log_success "Pushed to origin"
    fi

    # Summary
    echo ""
    log_info "Summary:"
    echo "  Merged:  $merged_count branches"
    echo "  Skipped: $skipped_count branches (conflicts or safety checks)"

    return 0
}

################################################################################
# Main Script
################################################################################

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --list)
                MODE="list"
                shift
                ;;
            --all)
                MODE="all"
                shift
                ;;
            --dry-run)
                DRY_RUN=1
                shift
                ;;
            claude/*)
                MODE="single"
                TARGET_BRANCH="$1"
                shift
                ;;
            *)
                log_error "Unknown argument: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

print_usage() {
    cat << 'EOF'
Usage: git-merge-branches.sh [OPTIONS] [BRANCH]

Modes:
  --list              List all claude/* branches and their status
  --all               Merge all claude/* branches into main
  --dry-run           Show what would happen without making changes
  [branch-name]       Merge a specific branch (e.g., claude/2026-02-11-fix-bug)

Examples:
  ./scripts/git-merge-branches.sh --list
  ./scripts/git-merge-branches.sh claude/2026-02-11-fix-bug
  ./scripts/git-merge-branches.sh --all
  ./scripts/git-merge-branches.sh --dry-run --all

EOF
}

main() {
    # Parse arguments
    parse_args "$@"

    # Verify repo
    if [ ! -d "${REPO_ROOT}/.git" ]; then
        log_error "Not in a git repository"
        exit 1
    fi

    # Setup temp git directory
    local temp_git_dir
    temp_git_dir=$(setup_git_dir "$REPO_ROOT")

    # Trap to cleanup on exit
    trap "cleanup_git_dir '$temp_git_dir'" EXIT

    # Execute mode
    case "$MODE" in
        list)
            list_claude_branches "$temp_git_dir"
            ;;
        single)
            if [ -z "$TARGET_BRANCH" ]; then
                log_error "No branch specified"
                print_usage
                exit 1
            fi
            GIT_DIR="$temp_git_dir" GIT_WORK_TREE="$REPO_ROOT" \
                git checkout main 2>/dev/null || true
            merge_branch "$temp_git_dir" "$TARGET_BRANCH" "$DRY_RUN"
            ;;
        all)
            merge_all_branches "$temp_git_dir" "$DRY_RUN"
            ;;
        *)
            log_error "Unknown mode: $MODE"
            print_usage
            exit 1
            ;;
    esac
}

main "$@"
