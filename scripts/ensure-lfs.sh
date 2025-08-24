#!/usr/bin/env bash
set -euo pipefail

echo "[ensure-lfs] Start"

if ! command -v git >/dev/null 2>&1; then
  echo "[ensure-lfs] Git not available. Skipping LFS fetch."
  exit 0
fi

use_git_lfs() {
  echo "[ensure-lfs] Initializing Git LFS and fetching objects..."
  git lfs install || true
  git lfs fetch --all || true
  git lfs checkout || true
  
  # Verify that images were properly checked out (not LFS pointers)
  echo "[ensure-lfs] Verifying image checkout..."
  IMAGE_COUNT=0
  POINTER_COUNT=0
  
  if [ -d "public/images" ]; then
    while IFS= read -r -d '' file; do
      IMAGE_COUNT=$((IMAGE_COUNT + 1))
      # Check if file contains LFS pointer text
      if head -1 "$file" 2>/dev/null | grep -q "version https://git-lfs.github.com" 2>/dev/null; then
        POINTER_COUNT=$((POINTER_COUNT + 1))
        echo "[ensure-lfs] WARNING: $file is still an LFS pointer!"
      fi
    done < <(find public/images -name "*.jpg" -o -name "*.png" -o -name "*.webp" -print0 2>/dev/null || true)
    
    echo "[ensure-lfs] Found $IMAGE_COUNT image files, $POINTER_COUNT are still LFS pointers"
    
    if [ "$POINTER_COUNT" -gt 0 ]; then
      echo "[ensure-lfs] ERROR: Some images are still LFS pointers. Deployment may have image loading issues."
      return 1
    fi
  fi
}

if git lfs version >/dev/null 2>&1; then
  use_git_lfs
else
  echo "[ensure-lfs] Git LFS not found. Attempting portable install..."
  TMPDIR="${TMPDIR:-/tmp}"
  LFS_VER="v3.4.1"
  ARCHIVE="git-lfs-linux-amd64-${LFS_VER}.tar.gz"
  URL="https://github.com/git-lfs/git-lfs/releases/download/${LFS_VER}/${ARCHIVE}"
  DL_DIR="${TMPDIR}/git-lfs-download"
  INSTALL_DIR="$(pwd)/.git-lfs-bin"
  mkdir -p "$DL_DIR" "$INSTALL_DIR"
  echo "[ensure-lfs] Downloading ${URL}"
  curl -sSL "$URL" -o "$DL_DIR/${ARCHIVE}"
  tar -xzf "$DL_DIR/${ARCHIVE}" -C "$DL_DIR"
  # Find the git-lfs binary
  GIT_LFS_BIN="$(find "$DL_DIR" -type f -name git-lfs -perm -u+x | head -n 1 || true)"
  if [ -n "$GIT_LFS_BIN" ]; then
    echo "[ensure-lfs] Using portable git-lfs at $GIT_LFS_BIN"
    export PATH="$(dirname "$GIT_LFS_BIN"):$PATH"
    use_git_lfs || true
  else
    echo "[ensure-lfs] Portable git-lfs not found after extraction."
  fi
fi

echo "[ensure-lfs] Done"
