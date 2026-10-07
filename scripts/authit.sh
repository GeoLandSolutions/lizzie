#!/usr/bin/env bash
# Store the Cloudflare deploy secrets for GitHub Actions.
#
# Needs a long-lived API token from the Cloudflare dashboard (Valuebase account,
# "Edit Cloudflare Workers" template). Wrangler's own login token is short-lived
# and stops working in CI soon after it's copied, so it isn't used here.
#
#   CLOUDFLARE_API_TOKEN=... bun run authit   # or run without it to be prompted
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GH_REPO="${GH_REPO:-GeoLandSolutions/lizzie}"

for cmd in gh curl python3; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "error: $cmd not found" >&2
    exit 1
  fi
done

# account id comes from wrangler.jsonc so CI deploys to the same account as local
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-$(python3 - "$ROOT/wrangler.jsonc" <<'PY'
import re, sys
m = re.search(r'"account_id"\s*:\s*"([0-9a-f]{32})"', open(sys.argv[1]).read())
if not m:
    raise SystemExit('no account_id in wrangler.jsonc')
print(m.group(1))
PY
)}"

TOKEN="${CLOUDFLARE_API_TOKEN:-}"
if [[ -z "$TOKEN" ]]; then
  read -rsp "Cloudflare API token: " TOKEN
  echo
fi
if [[ -z "$TOKEN" ]]; then
  echo "error: no API token given" >&2
  exit 1
fi

# check the token works for this account before storing it (user- or account-owned)
ok=0
for url in \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/tokens/verify"; do
  if curl -fsS -H "Authorization: Bearer $TOKEN" "$url" 2>/dev/null | grep -q '"status":"active"'; then
    ok=1
    break
  fi
done
if [[ "$ok" != 1 ]]; then
  echo "error: Cloudflare rejected the token (not active, or not for account $ACCOUNT_ID)" >&2
  exit 1
fi

echo "Setting CLOUDFLARE_ACCOUNT_ID ($ACCOUNT_ID) for $GH_REPO ..."
printf '%s' "$ACCOUNT_ID" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo "$GH_REPO"

echo "Setting CLOUDFLARE_API_TOKEN for $GH_REPO ..."
printf '%s' "$TOKEN" | gh secret set CLOUDFLARE_API_TOKEN --repo "$GH_REPO"

echo "Done. Re-run the deploy with: gh workflow run deploy.yml --repo $GH_REPO"
