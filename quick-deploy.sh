#!/bin/bash
git add .
git commit -m "Auto-update from Claude chat"
git push origin main
echo "Auto-deployed to production!"
