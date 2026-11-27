#!/bin/zsh -f
set -euo pipefail
umask 077
cd "${0:A:h:h}"
node ops/staging-bootstrap.mjs --verify
node ops/staging-candidate.mjs
