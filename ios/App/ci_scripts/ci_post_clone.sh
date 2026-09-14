#!/bin/sh
set -eu

: "${CI_PRIMARY_REPOSITORY_PATH:?CI_PRIMARY_REPOSITORY_PATH is required by Xcode Cloud}"
cd "$CI_PRIMARY_REPOSITORY_PATH"

node_is_compatible() {
  command -v node >/dev/null 2>&1 &&
    node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'
}

echo "Checking Node.js..."
if ! node_is_compatible; then
  echo "Installing/activating Node.js 22..."

  if command -v brew >/dev/null 2>&1; then
    brew_command=$(command -v brew)
  elif [ -x /opt/homebrew/bin/brew ]; then
    brew_command=/opt/homebrew/bin/brew
  elif [ -x /usr/local/bin/brew ]; then
    brew_command=/usr/local/bin/brew
  else
    echo "error: Homebrew is required to provision Node.js 22 in Xcode Cloud." >&2
    exit 1
  fi

  if ! "$brew_command" list --versions node@22 >/dev/null 2>&1; then
    HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 \
      "$brew_command" install node@22
  fi

  node_prefix=$("$brew_command" --prefix node@22)
  PATH="$node_prefix/bin:$PATH"
  export PATH
fi

if ! node_is_compatible; then
  echo "error: Capacitor 8 requires Node.js 22 or newer." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm is required because package-lock.json is the canonical lockfile." >&2
  exit 1
fi

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
echo "Node executable: $(command -v node)"
echo "npm executable: $(command -v npm)"

if [ ! -f package-lock.json ]; then
  echo "error: package-lock.json is missing; refusing a non-deterministic install." >&2
  exit 1
fi

echo "Installing JavaScript dependencies..."
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

echo "Synchronizing Capacitor iOS..."
./node_modules/.bin/cap sync ios
