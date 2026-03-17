#!/bin/bash
set -e

echo "Post-merge setup: installing dependencies..."
npm install --no-fund --no-audit
echo "Post-merge setup: done."
