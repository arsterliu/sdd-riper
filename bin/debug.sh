#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"
source "$SCRIPT_DIR/_common.sh"

print_usage() {
  cat <<'EOF'
Usage: debug.sh <project-dir> [--log <log-file>] [--error <error-message>]
Exit codes: 0=success, 1=missing asset, 3=param error
EOF
}

if [[ "${1:-}" == "-h" ]] || [[ "${1:-}" == "--help" ]]; then
  print_usage
  exit 0
fi

if [[ $# -eq 0 ]]; then
  echo "[ERROR] Usage: debug.sh <project-dir> [--log <log-file>] [--error <error-message>]" >&2
  exit 3
fi

TARGET_DIR="${1:-}"
if [[ -z "$TARGET_DIR" || "$TARGET_DIR" == --* ]]; then
  echo "[ERROR] Usage: debug.sh <project-dir> [--log <log-file>] [--error <error-message>]" >&2
  exit 3
fi

DOCS_ROOT="$(_sdd_get_docs_root "$TARGET_DIR")"

shift

LOG_FILE=""
ERROR_MSG="(未指定)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)
      LOG_FILE="${2:-}"
      shift 2
      ;;
    --error)
      ERROR_MSG="${2:-}"
      shift 2
      ;;
    *)
      echo "[ERROR] Unknown option: $1" >&2
      exit 3
      ;;
  esac
done

if [[ ! -d "$DOCS_ROOT/" ]]; then
  echo "[ERROR] Project not initialized." >&2
  exit 1
fi

LATEST_SPEC="$(_sdd_find_latest_spec "$DOCS_ROOT/specs")"
if [[ -d "$LATEST_SPEC" ]]; then LATEST_SPEC=""; fi

# Log handling
LOG_CONTENT="(无日志文件)"
if [[ -n "$LOG_FILE" ]]; then
  if [[ -f "$LOG_FILE" ]]; then
    TOTAL_LINES=$(wc -l < "$LOG_FILE" | tr -d ' ')
    if [[ "$TOTAL_LINES" -gt 100 ]]; then
      LOG_CONTENT="$(head -n 100 "$LOG_FILE")
[TRUNCATED: showed 100/${TOTAL_LINES} lines]"
    else
      LOG_CONTENT="$(cat "$LOG_FILE")"
    fi
  else
    LOG_CONTENT="(日志文件未找到: $LOG_FILE)"
  fi
else
  AUTO_LOG=$(find "$DOCS_ROOT/evidence" -name "*.log" 2>/dev/null -print0 | xargs -0 ls -t 2>/dev/null | head -1 || echo "")
  if [[ -d "$AUTO_LOG" ]]; then AUTO_LOG=""; fi
  if [[ -n "$AUTO_LOG" && -f "$AUTO_LOG" ]]; then
    TOTAL_LINES=$(wc -l < "$AUTO_LOG" | tr -d ' ')
    if [[ "$TOTAL_LINES" -gt 100 ]]; then
      LOG_CONTENT="$(head -n 100 "$AUTO_LOG")
[TRUNCATED: showed 100/${TOTAL_LINES} lines]"
    else
      LOG_CONTENT="$(cat "$AUTO_LOG")"
    fi
  fi
fi

# Spec handling
EXECUTE_LOG="(未找到 Execute Log)"
if [[ -n "$LATEST_SPEC" && -f "$LATEST_SPEC" ]]; then
  # Extract §9 Execute Log section
  EXTRACTED=$(awk '/^## .*Execute Log/{flag=1; print; next} /^## /{if(flag) flag=0} flag' "$LATEST_SPEC")
  if [[ -n "$EXTRACTED" ]]; then
    TOTAL_LINES_SPEC=$(echo "$EXTRACTED" | wc -l | tr -d ' ')
    if [[ "$TOTAL_LINES_SPEC" -gt 50 ]]; then
      EXECUTE_LOG="$(echo "$EXTRACTED" | head -n 50)
[TRUNCATED: showed 50/${TOTAL_LINES_SPEC} lines]"
    else
      EXECUTE_LOG="$EXTRACTED"
    fi
  fi
fi

cat <<EOF
## DEBUG PROMPT

### 错误信息
${ERROR_MSG}

### 日志内容（≤100 行）
${LOG_CONTENT}

### 最近执行步骤（来自 Spec Execute Log）
${EXECUTE_LOG}

### AI 指令
请基于上述三项输入，定位根本原因（Root Cause），提出最小修复方案，并说明是否需要回退到 Plan 阶段。
禁止在未明确 Root Cause 的情况下提出修复方案。
EOF

exit 0
