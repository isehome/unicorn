#!/bin/bash
git add .
echo "Enter commit message:"
read message
git commit -m "$message"
git push origin main
echo "Pushed to GitHub - Vercel will auto-deploy!"
