#!/usr/bin/env bash
set -euo pipefail

P12_PATH="${1:-}"
P8_PATH="${2:-}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is required. Install it from https://cli.github.com/ and run: gh auth login" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -z "$P12_PATH" || ! -f "$P12_PATH" ]]; then
  echo "Usage: $0 /path/to/developer-id-application.p12 [/path/to/AuthKey_XXXXXXXXXX.p8]" >&2
  exit 1
fi

read -r -s -p "Password for $P12_PATH: " P12_PASSWORD
echo

if ! openssl pkcs12 -in "$P12_PATH" -noout -passin "pass:$P12_PASSWORD" >/dev/null 2>&1; then
  if ! openssl pkcs12 -legacy -in "$P12_PATH" -noout -passin "pass:$P12_PASSWORD" >/dev/null 2>&1; then
    echo "The .p12 could not be opened with that password. Nothing was uploaded." >&2
    exit 1
  fi
fi

TEST_KEYCHAIN="dockbricks-signing-verify-$$.keychain"
TEST_KEYCHAIN_PASSWORD="dockbricks-local-verify-$$"
cleanup_test_keychain() {
  security delete-keychain "$TEST_KEYCHAIN" >/dev/null 2>&1 || true
}
trap cleanup_test_keychain EXIT

security create-keychain -p "$TEST_KEYCHAIN_PASSWORD" "$TEST_KEYCHAIN" >/dev/null
security unlock-keychain -p "$TEST_KEYCHAIN_PASSWORD" "$TEST_KEYCHAIN" >/dev/null
if ! security import "$P12_PATH" -k "$TEST_KEYCHAIN" -P "$P12_PASSWORD" -T /usr/bin/codesign >/dev/null 2>&1; then
  echo "macOS security could not import this .p12 with that password. Nothing was uploaded." >&2
  echo "Try re-exporting the .p12 from Keychain Access, or create a macOS-compatible .p12 with:" >&2
  echo "openssl pkcs12 -export -legacy -in your-cert.pem -out dockbricks-final.p12 -name 'Developer ID Application: Patrick Jakobsen (537P4FPMZ4)'" >&2
  exit 1
fi
cleanup_test_keychain
trap - EXIT

SIGNING_IDENTITY="$(security find-identity -v -p codesigning | awk -F'"' '/Developer ID Application/ { print $2; exit }')"
if [[ -z "$SIGNING_IDENTITY" ]]; then
  echo "No Developer ID Application signing identity found in your keychain." >&2
  exit 1
fi

read -r -p "APPLE_API_ISSUER: " APPLE_API_ISSUER
read -r -p "APPLE_API_KEY: " APPLE_API_KEY
read -r -s -p "KEYCHAIN_PASSWORD for CI temporary keychain: " KEYCHAIN_PASSWORD
echo

TMP_CERT="$(mktemp)"
openssl base64 -A -in "$P12_PATH" -out "$TMP_CERT"

gh secret set APPLE_CERTIFICATE < "$TMP_CERT"
printf '%s' "$P12_PASSWORD" | gh secret set APPLE_CERTIFICATE_PASSWORD
printf '%s' "$SIGNING_IDENTITY" | gh secret set APPLE_SIGNING_IDENTITY
printf '%s' "$APPLE_API_ISSUER" | gh secret set APPLE_API_ISSUER
printf '%s' "$APPLE_API_KEY" | gh secret set APPLE_API_KEY
printf '%s' "$KEYCHAIN_PASSWORD" | gh secret set KEYCHAIN_PASSWORD

if [[ -n "$P8_PATH" ]]; then
  if [[ ! -f "$P8_PATH" ]]; then
    echo "Private key file not found: $P8_PATH" >&2
    exit 1
  fi
  gh secret set APPLE_API_KEY_P8 < "$P8_PATH"
else
  echo "APPLE_API_KEY_P8 was not updated. Add it manually or rerun with the .p8 path."
fi

rm -f "$TMP_CERT"

echo "macOS signing secrets uploaded as repository secrets."
echo "Detected signing identity: $SIGNING_IDENTITY"
