#!/bin/zsh -f
set -euo pipefail
umask 077
cd "${0:A:h:h}"
node ops/staging-bootstrap.mjs --verify
trap 'unset SWF_ACCESS_CAPTURE_ID SWF_ACCESS_CAPTURE_SECRET' EXIT
read -rs 'SWF_ACCESS_CAPTURE_ID?Paste the new Cloudflare Access Client ID (hidden), then press Return: '
print
read -rs 'SWF_ACCESS_CAPTURE_SECRET?Paste its Client Secret (hidden), then press Return: '
print
export SWF_ACCESS_CAPTURE_ID SWF_ACCESS_CAPTURE_SECRET
node ops/staging-access-capture.mjs --capture
unset SWF_ACCESS_CAPTURE_ID SWF_ACCESS_CAPTURE_SECRET
print 'Return to the Cloudflare service-token list, then reply: token saved.'
