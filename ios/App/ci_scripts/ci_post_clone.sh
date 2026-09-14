#!/bin/sh
set -eu

: "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required by Xcode Cloud}"
cd "$CI_PRIMARY_REPOSITORY_PATH"

if ! command -v node >/dev/null 2>&1; then
  echo "error: Node.js is required to install Capacitor dependencies." >&2
  exit 1
fi

node -e '
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    console.error(`error: Capacitor 8 requires Node.js 22 or newer; found ${process.versions.node}.`);
    process.exit(1);
  }
'

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required because package-lock.json is the canonical lockfile." >&2
  exit 1
fi

if [ ! -f package-lock.json ]; then
  echo "error: package-lock.json is missing; refusing a non-deterministic install." >&2
  exit 1
fi

echo "Installing JavaScript dependencies from package-lock.json..."
npm ci --no-audit --no-fund

for package in \
  app \
  browser \
  camera \
  haptics \
  keyboard \
  local-notifications \
  splash-screen \
  status-bar
do
  if [ ! -d "node_modules/@capacitor/$package" ]; then
    echo "error: npm ci did not install @capacitor/$package." >&2
    exit 1
  fi
done

if [ ! -x node_modules/.bin/cap ]; then
  echo "error: the lockfile install did not provide the Capacitor CLI." >&2
  exit 1
fi

echo "Synchronizing committed Capacitor iOS metadata..."
./node_modules/.bin/cap sync ios
