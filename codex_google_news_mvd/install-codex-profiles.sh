#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "${HOME}/.codex"

install -m 600 "${BUNDLE_DIR}/codex-profiles/sol-high.config.toml" \
  "${HOME}/.codex/sol-high.config.toml"
install -m 600 "${BUNDLE_DIR}/codex-profiles/luna-max.config.toml" \
  "${HOME}/.codex/luna-max.config.toml"
install -m 600 "${BUNDLE_DIR}/codex-profiles/luna-xhigh-fallback.config.toml" \
  "${HOME}/.codex/luna-xhigh-fallback.config.toml"

cat <<'EOF'
Installed:
  ~/.codex/sol-high.config.toml
  ~/.codex/luna-max.config.toml
  ~/.codex/luna-xhigh-fallback.config.toml

Start the project owner:
  codex --profile sol-high

Then run /status and paste START_PROMPT.md.
EOF
