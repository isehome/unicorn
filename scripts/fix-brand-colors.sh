#!/bin/bash
# Fix brand color violations across the codebase
# This script replaces Tailwind green/emerald classes with the brand olive green (#94AF32)

# NOTE: This is a GUIDE - manual review is needed for each case
# Some green usages might be intentional (like error vs success states)

echo "Finding all green/emerald Tailwind class violations..."
echo ""

# List all violations with context
grep -rn "text-green-\|bg-green-\|text-emerald-\|bg-emerald-\|border-green-" \
  /sessions/magical-jolly-davinci/mnt/unicorn/src \
  --include="*.js" --include="*.jsx" \
  | grep -v node_modules

echo ""
echo "Total violations:"
grep -r "text-green-\|bg-green-\|text-emerald-\|bg-emerald-\|border-green-" \
  /sessions/magical-jolly-davinci/mnt/unicorn/src \
  --include="*.js" --include="*.jsx" \
  | grep -v node_modules | wc -l

echo ""
echo "=== REPLACEMENT GUIDE ==="
echo ""
echo "For SUCCESS states, replace with inline styles:"
echo "  text-green-500/600/700 → style={{ color: '#94AF32' }}"
echo "  bg-green-50/100 → style={{ backgroundColor: 'rgba(148, 175, 50, 0.1)' }}"
echo "  border-green-200 → style={{ borderColor: 'rgba(148, 175, 50, 0.3)' }}"
echo ""
echo "For dark mode variants:"
echo "  dark:text-green-400 → (include in same style object)"
echo "  dark:bg-green-900/20 → (use CSS custom property or conditional)"
echo ""
echo "DO NOT replace green used for ERROR states (those should be red)"
