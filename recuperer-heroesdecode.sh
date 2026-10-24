#!/usr/bin/env bash
# Télécharge HeroesDecode (MIT, HeroesToolChest/HeroesDecode) et le dézippe dans overlay/heroesdecode/
# pour qu'electron-builder l'embarque (build.extraResources dans package.json).
# Usage : ./recuperer-heroesdecode.sh
set -euo pipefail
VERSION="1.5.0"
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$ICI/heroesdecode"
SHA256="a77db1f4db3a20ccd0cdd122831e4d265616b2d0c197f967d084f44a6a50a82a" # empreinte du zip officiel v1.5.0
URL="https://github.com/HeroesToolChest/HeroesDecode/releases/download/v${VERSION}/HeroesDecode.${VERSION}-scd-win-x64.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Téléchargement de HeroesDecode ${VERSION} (scd-win-x64)…"
curl -fsSL -o "$TMP/heroesdecode.zip" "$URL"
echo "$SHA256  $TMP/heroesdecode.zip" | sha256sum -c --quiet || { echo "Empreinte inattendue : téléchargement refusé." >&2; exit 1; }

rm -rf "$DEST"
mkdir -p "$DEST"
unzip -q "$TMP/heroesdecode.zip" -d "$TMP/extrait"
# Le zip contient un sous-dossier win-x64/ : on remonte HeroesDecode.exe directement dans heroesdecode/.
mv "$TMP/extrait/win-x64"/* "$DEST"/

echo "HeroesDecode ${VERSION} prêt dans $DEST"
ls -la "$DEST"
