#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER="${WRANGLER:-$ROOT/node_modules/.bin/wrangler}"
GH_REPO="${GH_REPO:-GeoLandSolutions/lizzie}"

if [[ ! -x "$WRANGLER" ]]; then
  echo "error: wrangler not found at $WRANGLER (run bun install)" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh CLI not found (https://cli.github.com/)" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 not found" >&2
  exit 1
fi

WHOAMI_JSON="$("$WRANGLER" whoami --json)"
ACCOUNT_ID="$(printf '%s' "$WHOAMI_JSON" | python3 -c "
import json, sys
data = json.load(sys.stdin)
accounts = data.get('accounts') or []
if not accounts:
    raise SystemExit('no Cloudflare accounts in wrangler whoami output')
print(accounts[0]['id'])
")"

echo "Setting CLOUDFLARE_ACCOUNT_ID for $GH_REPO ..."
printf '%s' "$ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$GH_REPO"

echo "Setting CLOUDFLARE_API_TOKEN for $GH_REPO ..."
"$WRANGLER" auth token --json | python3 -c "
import json, sys
token = json.load(sys.stdin).get('token')
if not token:
    raise SystemExit('no token in wrangler auth token output')
print(token)
" | gh secret set CLOUDFLARE_API_TOKEN --repo "$GH_REPO"

echo "Done. GitHub Actions secrets updated for $GH_REPO."
