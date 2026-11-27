#!/bin/zsh -f
set -euo pipefail
umask 077
cd "${0:A:h:h}"
node ops/staging-bootstrap.mjs --verify
trap 'unset CLOUDFLARE_API_TOKEN' EXIT
read -rs 'CLOUDFLARE_API_TOKEN?Paste the temporary Cloudflare deployment API token (hidden), then press Return: '
print
export CLOUDFLARE_API_TOKEN
node ops/staging-service-provision.mjs
unset CLOUDFLARE_API_TOKEN
