#!/bin/sh
set -eu

ios_root="${1:?Usage: verify-ios-runtime.sh IOS_ROOT CONFIGURATION}"
configuration="${2:?Usage: verify-ios-runtime.sh IOS_ROOT CONFIGURATION}"
expectation_file="$ios_root/.calistheni-runtime-mode"
config_file="$ios_root/App/capacitor.config.json"

if [ ! -f "$expectation_file" ] || [ ! -f "$config_file" ]; then
  echo "error: Native runtime is not prepared. Run an explicit mobile:sync:ios:* command first." >&2
  exit 1
fi

expectation=$(/usr/bin/tr -d '\r\n' < "$expectation_file")
case "$expectation" in
  remote:staging:none)
    expected_url="https://calistheni-staging.vercel.app"
    expected_logging="none"
    ;;
  remote:production:none)
    expected_url="https://calistheni.app"
    expected_logging="none"
    ;;
  bundled)
    actual_logging=$(/usr/bin/plutil -extract loggingBehavior raw -o - "$config_file")
    if [ "$configuration" = "Release" ] && [ "$actual_logging" != "none" ]; then
      echo "error: Release builds require loggingBehavior=none." >&2
      exit 1
    fi
    echo "[Capacitor] Xcode bundled runtime selected (logging=$actual_logging configuration=$configuration)."
    exit 0
    ;;
  *)
    echo "error: Unknown native runtime expectation: $expectation" >&2
    exit 1
    ;;
esac

actual_url=$(/usr/bin/plutil -extract server.url raw -o - "$config_file")
actual_logging=$(/usr/bin/plutil -extract loggingBehavior raw -o - "$config_file")

if [ "$actual_url" != "$expected_url" ]; then
  echo "error: Native runtime mismatch: expected $expected_url, found $actual_url" >&2
  exit 1
fi
if [ "$actual_logging" != "$expected_logging" ]; then
  echo "error: Native logging mismatch: expected $expected_logging, found $actual_logging" >&2
  exit 1
fi
if [ "$configuration" = "Release" ] && [ "$actual_logging" != "none" ]; then
  echo "error: Release builds require loggingBehavior=none. Run the target's release sync command." >&2
  exit 1
fi

echo "[Capacitor] Xcode runtime verified: $expectation url=$actual_url configuration=$configuration"
