#!/bin/sh
set -eu

# Xcode launched from Finder does not inherit the interactive shell PATH. Keep
# Node discovery project-owned and machine-independent instead of embedding a
# developer-specific absolute path in the .pbxproj.
minimum_major=22

node_is_compatible() {
  candidate=$1
  [ -x "$candidate" ] || return 1
  major=$("$candidate" -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null) || return 1
  case "$major" in
    ''|*[!0-9]*) return 1 ;;
  esac
  [ "$major" -ge "$minimum_major" ]
}

resolve_node() {
  if [ -n "${CALISTHENI_NODE_BINARY:-}" ] && node_is_compatible "$CALISTHENI_NODE_BINARY"; then
    printf '%s\n' "$CALISTHENI_NODE_BINARY"
    return 0
  fi

  path_node=$(command -v node 2>/dev/null || true)
  if [ -n "$path_node" ] && node_is_compatible "$path_node"; then
    printf '%s\n' "$path_node"
    return 0
  fi

  for candidate in \
    /opt/homebrew/opt/node@22/bin/node \
    /opt/homebrew/bin/node \
    /usr/local/opt/node@22/bin/node \
    /usr/local/bin/node \
    "${VOLTA_HOME:-${HOME:-}/.volta}/bin/node" \
    "${FNM_MULTISHELL_PATH:-}/bin/node" \
    "${HOME:-}/.local/share/mise/shims/node" \
    "${HOME:-}/.asdf/shims/node"
  do
    if node_is_compatible "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  # nvm and fnm installations are intentionally searched without sourcing an
  # interactive shell profile, which is unreliable inside Xcode and archives.
  for candidate in \
    "${NVM_DIR:-${HOME:-}/.nvm}"/versions/node/*/bin/node \
    "${XDG_DATA_HOME:-${HOME:-}/.local/share}"/fnm/node-versions/*/installation/bin/node \
    "${HOME:-}/Library/Application Support/fnm/node-versions"/*/installation/bin/node
  do
    if node_is_compatible "$candidate"; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

if [ "$#" -eq 0 ]; then
  echo "error: run-with-node.sh requires a JavaScript entry point or Node arguments." >&2
  exit 64
fi

if ! node_executable=$(resolve_node); then
  cat >&2 <<'MESSAGE'
error: Calistheni's Xcode build requires Node.js 22 or newer, but none was found.
Install Node 22+ (for example, `brew install node@22`) or set
CALISTHENI_NODE_BINARY to a compatible executable in the Xcode scheme/build environment.
Checked Xcode PATH, Homebrew (Apple Silicon and Intel), Volta, fnm, nvm, mise, and asdf.
MESSAGE
  exit 127
fi

# Some Node entry points launch executable JavaScript helpers whose shebang is
# `#!/usr/bin/env node`. Xcode's GUI PATH does not include Homebrew, nvm, fnm,
# or Volta by default, so make the directory we just resolved available to
# those child processes as well as invoking the first process explicitly.
case "$node_executable" in
  */*) node_directory=${node_executable%/*} ;;
  *) node_directory= ;;
esac
if [ -n "$node_directory" ]; then
  PATH="$node_directory:${PATH:-/usr/bin:/bin}"
  export PATH
fi

exec "$node_executable" "$@"
