#!/usr/bin/env bash
# Télécharge HeroesDecode (MIT, HeroesToolChest/HeroesDecode) et le dézippe dans overlay/heroesdecode/
# pour qu'electron-builder l'embarque (build.extraResources dans package.json).
# Usage : ./recuperer-heroesdecode.sh
set -euo pipefail
VERSION="1.5.0"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$ICI/heroesdecode"
URL="https://github.com/HeroesToolChest/HeroesDecode/releases/download/v${VERSION}/HeroesDecode.${VERSION}-scd-win-x64.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Téléchargement de HeroesDecode ${VERSION} (scd-win-x64)…"
curl -sL -o "$TMP/heroesdecode.zip" "$URL"

rm -rf "$DEST"
mkdir -p "$DEST"
unzip -q "$TMP/heroesdecode.zip" -d "$TMP/extrait"
# Le zip contient un sous-dossier win-x64/ : on remonte HeroesDecode.exe directement dans heroesdecode/.
mv "$TMP/extrait/win-x64"/* "$DEST"/

echo "HeroesDecode ${VERSION} prêt dans $DEST"
ls -la "$DEST"
