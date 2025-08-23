#!/usr/bin/env bash
set -euo pipefail

if command -v git >/dev/null 2>&1; then
  if git lfs version >/dev/null 2>&1; then
    echo "[ensure-lfs] Initializing Git LFS and fetching objects..."
    git lfs install
    git lfs fetch --all || true
    git lfs checkout || true
  else
    echo "[ensure-lfs] Git LFS not installed in this environment."
  fi
else
  echo "[ensure-lfs] Git not available."
fi

echo "[ensure-lfs] Done."
