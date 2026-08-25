#!/usr/bin/env bash
set -euo pipefail

TOOL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
mkdir -p "${HOME}/.codex"

install -m 600 "${TOOL_DIR}/profiles/sol-high.config.toml" \
  "${HOME}/.codex/sol-high.config.toml"
install -m 600 "${TOOL_DIR}/profiles/luna-max.config.toml" \
  "${HOME}/.codex/luna-max.config.toml"
install -m 600 "${TOOL_DIR}/profiles/luna-xhigh-fallback.config.toml" \
  "${HOME}/.codex/luna-xhigh-fallback.config.toml"

cat <<'EOF'
설치 완료:
  ~/.codex/sol-high.config.toml
  ~/.codex/luna-max.config.toml
  ~/.codex/luna-xhigh-fallback.config.toml

저장소 루트에서 `codex --profile sol-high`를 실행한 뒤 /status를 확인하세요.
EOF
