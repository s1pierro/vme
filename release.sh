#!/bin/bash

set -e

cd "$(dirname "$0")"

if [ -n "$1" ]; then
    VERSION="$1"
else
    CURRENT=$(grep -oP '"vme r\K[0-9]+' manifest.json | head -1)
    VERSION=$((CURRENT + 1))
fi

echo "Releasing vme r$VERSION..."

# manifest.json
sed -i "s/\"name\": \"vme r[0-9]*\"/\"name\": \"vme r$VERSION\"/" manifest.json

# index.html - manifest link
sed -i "s/manifest.json?r[0-9]*/manifest.json?r$VERSION/" index.html

# index.html - CSS version
sed -i "s/css\/style.css?v=[0-9]*/css\/style.css?v=$VERSION/" index.html

# service-worker.js - cache name
sed -i "s/pwa-cache-v[0-9]*/pwa-cache-v$VERSION/" service-worker.js

# js/vme.js - service worker registration
sed -i "s/service-worker.js?v=[0-9]*/service-worker.js?v=$VERSION/" js/vme.js

git add -A
git commit -m "vme r$VERSION"
git push

echo "Released vme r$VERSION ✓"
