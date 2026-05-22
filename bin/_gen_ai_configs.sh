#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCAFFOLD_ROOT="$(dirname "$SCRIPT_DIR")"

# Argument validation (positional, matching init.sh call pattern)
if [[ $# -lt 1 ]]; then
  echo "[ERROR] Usage: _gen_ai_configs.sh <target-dir> [mode] [force]" >&2
  exit 3
fi

TARGET_DIR="$1"
MODE="${2:-standard}"
FORCE="${3:-}"

# Validate mode
case "$MODE" in
  standard|lite|micro) ;;
  *) echo "[ERROR] Invalid mode: $MODE (expected standard|lite|micro)" >&2; exit 3 ;;
esac

CREATED=0
SKIPPED=0

# Select protocol source
if [[ "$MODE" == "lite" ]]; then
  PROTOCOL_FILE="$SCAFFOLD_ROOT/protocols/sdd-riper-one-light.md"
else
  PROTOCOL_FILE="$SCAFFOLD_ROOT/protocols/sdd-riper-one.md"
fi

# Helper: write_config <path> <content-heredoc>
write_config() {
  local dst="$1"
  local content="$2"
  if [[ -f "$dst" ]] && [[ -z "$FORCE" ]]; then
    echo "[SKIP] $dst already exists"
    SKIPPED=$((SKIPPED + 1))
    return
  fi
  mkdir -p "$(dirname "$dst")"
  printf '%s\n' "$content" > "$dst"
  echo "[CREATE] $dst"
  CREATED=$((CREATED + 1))
}

# Read first 30 lines of protocol for embedding
PROTOCOL_EXCERPT=$(head -30 "$PROTOCOL_FILE" 2>/dev/null || echo "(protocol excerpt unavailable)")
PROTOCOL_EXCERPT_20=$(head -20 "$PROTOCOL_FILE" 2>/dev/null || echo "(protocol excerpt unavailable)")

# 1. AGENTS.md
AGENTS_CONTENT="# SDD-RIPER Agent Instructions

## Core Rules (No Exceptions)
- **No Spec, No Code** — Do not write code unless a task Spec exists
- **Spec is Truth** — The Spec is the single source of truth, not the code
- **Reverse Sync** — If code diverges from Spec, update the Spec
- **Plan Approved** gate — Do not execute until Plan is explicitly approved by a human
- **Debug Before Retry** — When a step fails, run \`debug\` to find root cause before retrying

## RIPER Workflow
Follow the RIPER phases: Research → Innovate → Plan → Execute → Review

## Context Layers
- **Spec**: Current task work order (<docs-root>/specs/, defaults to mydocs/specs/)
- **CodeMap**: Module structure and call chains (<docs-root>/codemap/, defaults to mydocs/codemap/)
- **ProjectMap**: Cross-repo contracts and ownership (<docs-root>/projectmap.md, defaults to mydocs/projectmap.md)

## Docs Root Configuration
The docs root directory defaults to \`mydocs/\` but can be overridden via \`.sdd-config\` (\`DOCS_DIR=...\`).

## Mode: ${MODE}

## Protocol Reference
${PROTOCOL_EXCERPT}"

write_config "$TARGET_DIR/AGENTS.md" "$AGENTS_CONTENT"

# 2. CLAUDE.md
CLAUDE_CONTENT="# Claude Project Instructions — SDD-RIPER

## Memory
- Always load the latest Spec before starting any task
- Track RIPER phase transitions explicitly

## Behavior
- NEVER write code without a Spec
- NEVER proceed past Plan without \"Plan Approved By\" being filled
- ALWAYS record deviations from Plan in Execute Log
- ALWAYS run \`debug\` before retrying a failed step

## RIPER Phase Gate
Current phase must be explicit. Prohibited: jumping phases silently.

## Entry Commands
- sdd discover <dir> --task-name <name> ... = start a new task / Research phase
- sdd resume <dir> = resume an existing task / reload context

## Docs Root Configuration
The docs root directory defaults to \`mydocs/\` but can be overridden via \`.sdd-config\` (\`DOCS_DIR=...\`).

## Mode: ${MODE}

## Protocol Reference
${PROTOCOL_EXCERPT}"

write_config "$TARGET_DIR/CLAUDE.md" "$CLAUDE_CONTENT"

# 3. .cursorrules
CURSOR_CONTENT="# SDD-RIPER Rules for Cursor

RULE: Never write code unless a task Spec exists in <docs-root>/specs/ (defaults to mydocs/specs/)
RULE: RIPER phases are Research → Innovate → Plan → Execute → Review
RULE: Plan Approved By must be filled before Execute phase
RULE: Spec is Truth — code must match Spec, not the other way around
RULE: Debug before retry — when a step fails, run \`debug\` to find root cause first
RULE: ProjectMap defines cross-repo contracts — always check before touching APIs
RULE: Docs root defaults to mydocs/ but can be overridden via .sdd-config (DOCS_DIR=...)
RULE: mode=${MODE}

## Protocol Reference
${PROTOCOL_EXCERPT_20}"

write_config "$TARGET_DIR/.cursorrules" "$CURSOR_CONTENT"

# 4. .github/copilot-instructions.md
COPILOT_CONTENT="# GitHub Copilot Instructions — SDD-RIPER

## Workflow
Always follow the SDD-RIPER methodology when generating code suggestions.

## Key Rules
- No Spec, No Code: Check <docs-root>/specs/ (defaults to mydocs/specs/) before suggesting code
- RIPER phases: Research → Innovate → Plan → Execute → Review
- Plan Approved gate: Do not suggest implementation code until Plan is approved
- Debug before retry: When code fails, run \`debug\` to find root cause before retrying
- ProjectMap: Cross-repo interfaces are documented in <docs-root>/projectmap.md (defaults to mydocs/projectmap.md)

## Docs Root Configuration
The docs root directory defaults to \`mydocs/\` but can be overridden via \`.sdd-config\` (\`DOCS_DIR=...\`).

## Mode: ${MODE}

## Protocol Reference
${PROTOCOL_EXCERPT_20}"

write_config "$TARGET_DIR/.github/copilot-instructions.md" "$COPILOT_CONTENT"

exit 0
