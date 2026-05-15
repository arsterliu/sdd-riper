#!/bin/bash
# _common.sh: Pure utility functions library for sdd-riper
# Most functions return values via final echo and have no stdout side effects.
# Exception: _sdd_should_suggest_codemap() prints advisory text to stdout when
#   conditions are met — callers must account for this in output parsing.
# Legacy spec warnings go to stderr only.

_sdd_get_config_file() {
  local project_dir="$1"
  echo "$project_dir/.sdd-config"
}

_sdd_is_valid_docs_dir_name() {
  local name="$1"
  [[ "$name" =~ ^[A-Za-z0-9._-]+$ ]] && [[ "$name" != "." ]] && [[ "$name" != ".." ]]
}

_sdd_get_docs_dir() {
  local project_dir="$1"
  local config_file configured docs_dir="mydocs"
  config_file="$(_sdd_get_config_file "$project_dir")"

  if [[ -f "$config_file" ]]; then
    configured="$(grep '^DOCS_DIR=' "$config_file" 2>/dev/null | head -1 | sed 's/^DOCS_DIR=//; s/\r$//' || true)"
    configured="${configured#\"}"
    configured="${configured%\"}"
    if [[ -n "$configured" ]] && _sdd_is_valid_docs_dir_name "$configured"; then
      docs_dir="$configured"
    fi
  fi

  echo "$docs_dir"
}

_sdd_get_docs_root() {
  local project_dir="$1"
  local docs_dir
  docs_dir="$(_sdd_get_docs_dir "$project_dir")"
  echo "$project_dir/$docs_dir"
}

# _sdd_get_mode <project_dir>
#   Read MODE from .sdd-config. Returns "standard" if not set or unrecognised.
_sdd_get_mode() {
  local project_dir="$1"
  local config_file mode=""
  config_file="$(_sdd_get_config_file "$project_dir")"
  if [[ -f "$config_file" ]]; then
    mode="$(grep '^MODE=' "$config_file" 2>/dev/null | head -1 | sed 's/^MODE=//; s/\r$//' || true)"
    mode="${mode#\"}"; mode="${mode%\"}"
  fi
  case "$mode" in
    lite)  echo "lite" ;;
    micro) echo "micro" ;;
    *)     echo "standard" ;;
  esac
}

# _sdd_get_spec_template <scaffold_root> <project_dir>
#   Return path to the correct spec template based on project mode.
_sdd_get_spec_template() {
  local scaffold_root="$1" project_dir="$2"
  local mode
  mode="$(_sdd_get_mode "$project_dir")"
  echo "${scaffold_root}/templates/spec-${mode}.md"
}

# _sdd_next_version <dir> <name>
#   Find the highest version of a spec with given name in <dir>,
#   then return the next incremented version.
#   Returns: "v1.0" if no matching spec exists, else "v{major}.{minor+1}"
_sdd_next_version() {
  local dir="$1" name="$2"
  local max_major=0 max_minor=-1
  local f bname vmaj vmin
  while IFS= read -r -d '' f; do
    bname="$(basename "$f")"
    if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-.+\.md$ ]]; then
      local stem="${bname%.md}"
      local vprefix="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
      local after_prefix="${stem#${vprefix}-}"
      if [[ "$after_prefix" == "$name" ]]; then
        vmaj="${BASH_REMATCH[1]}"
        vmin="${BASH_REMATCH[2]}"
        if (( vmaj > max_major )) || (( vmaj == max_major && vmin > max_minor )); then
          max_major=$vmaj
          max_minor=$vmin
        fi
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  if (( max_minor == -1 )); then echo "v1.0"; else echo "v${max_major}.$((max_minor + 1))"; fi
}

# _sdd_version_exists <dir> <logical_name> <version>
#   Returns 0 (true) if v{version}-{name}.md already exists in <dir>.
_sdd_version_exists() {
  local dir="$1" name="$2" ver="$3"
  [[ -f "$dir/${ver}-${name}.md" ]]
}

# _sdd_find_latest_spec <specs_dir>
#   Find the highest-versioned spec of the most-recently-modified task.
#   Two-step logic:
#     1. Scan all versioned specs (v{N}.{M}-{taskname}.md), track max mtime per task
#     2. Find task with highest mtime, then find highest version of that task
#   Legacy unversioned specs (not matching v{N}.{M}-name.md) emit [WARN] to stderr.
#   Returns: Full path to the selected spec file, or empty string if no specs found.
_sdd_find_latest_spec() {
  local specs_dir="$1"
  declare -A _TASK_MTIME
  local _f _bname _tname _mtime
  
  # Step 1: Scan all files, track max mtime per task
  while IFS= read -r -d '' _f; do
    _bname="$(basename "$_f")"
    if [[ "$_bname" =~ ^v([0-9]+)\.([0-9]+)-(.+)\.md$ ]]; then
      _tname="${BASH_REMATCH[3]}"
      _mtime=$(stat -c '%Y' "$_f" 2>/dev/null || stat -f '%m' "$_f" 2>/dev/null || echo 0)
      if [[ -z "${_TASK_MTIME[$_tname]+x}" ]] || (( _mtime > _TASK_MTIME[$_tname] )); then
        _TASK_MTIME[$_tname]=$_mtime
      fi
    elif [[ "$_bname" != ".gitkeep" && "$_bname" == *.md ]]; then
      # Legacy unversioned spec detected
      echo "[WARN] Legacy unversioned spec found: $_bname" >&2
    fi
  done < <(find "$specs_dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  
  # Step 2: Find task with highest mtime
  local _LATEST_TASK="" _LATEST_MTIME=0
  for _tname in "${!_TASK_MTIME[@]}"; do
    if (( _TASK_MTIME[$_tname] > _LATEST_MTIME )); then
      _LATEST_MTIME=${_TASK_MTIME[$_tname]}
      _LATEST_TASK=$_tname
    fi
  done
  
  # Step 3: Find highest version of the latest task
  local LATEST_SPEC="" _best_major=0 _best_minor=-1
  if [[ -n "$_LATEST_TASK" ]]; then
    while IFS= read -r -d '' _f; do
      _bname="$(basename "$_f")"
      if [[ "$_bname" =~ ^v([0-9]+)\.([0-9]+)-${_LATEST_TASK}\.md$ ]]; then
        local _vmaj="${BASH_REMATCH[1]}" _vmin="${BASH_REMATCH[2]}"
        if (( _vmaj > _best_major )) || (( _vmaj == _best_major && _vmin > _best_minor )); then
          _best_major=$_vmaj
          _best_minor=$_vmin
          LATEST_SPEC="$_f"
        fi
      fi
    done < <(find "$specs_dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  fi
  
  echo "$LATEST_SPEC"
}

# _sdd_extract_section <file> <section-pattern> [max-lines]
#   Extract raw text content of the first ## heading whose text matches
#   <section-pattern> (awk regex). Returns lines between that heading and the
#   next ## heading. Optionally truncated to <max-lines> lines (default 200).
#   Returns: raw section lines (may include HTML comment lines), or empty.
_sdd_extract_section() {
  local file="$1" pattern="$2" max_lines="${3:-200}"
  awk -v pat="$pattern" -v max="$max_lines" '
    BEGIN { found=0; count=0 }
    /^## / {
      if (found) exit
      if ($0 ~ ("^## .*" pat)) { found=1 }
      next
    }
    found {
      if (max > 0 && count >= max) { print "[TRUNCATED]"; exit }
      print; count++
    }
  ' "$file" 2>/dev/null
}

# _sdd_should_suggest_codemap <project-dir> <docs-dir>
#   Prints a CodeMap suggestion to stdout if ALL of these are true:
#     - codemap dir has no .md files (excluding .gitkeep)
#     - source file count in project > 20
#     - a recognised project-marker file exists (package.json, go.mod, etc.)
#   No output and returns 0 when the suggestion is not warranted.
_sdd_should_suggest_codemap() {
  local dir="$1" docs_dir="${2:-mydocs}"
  local has_codemap=false codemap_count

  if [[ -d "$dir/$docs_dir/codemap" ]]; then
    codemap_count=$(find "$dir/$docs_dir/codemap" -name "*.md" ! -name ".gitkeep" 2>/dev/null | wc -l | tr -d ' ')
    [[ "$codemap_count" -gt 0 ]] && has_codemap=true
  fi
  [[ "$has_codemap" == "true" ]] && return 0

  local src_count
  src_count=$(find "$dir" -maxdepth 6 \
    \( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" \
       -o -name "*.py" -o -name "*.go" -o -name "*.java" -o -name "*.cs" \
       -o -name "*.rb" -o -name "*.php" -o -name "*.rs" -o -name "*.cpp" -o -name "*.c" \) \
    -not -path "*/node_modules/*" -not -path "*/.git/*" -not -path "*/vendor/*" \
    -not -path "*/dist/*" -not -path "*/build/*" -not -path "*/target/*" \
    2>/dev/null | wc -l | tr -d ' ')

  local has_marker=false
  for marker in package.json go.mod pyproject.toml pom.xml Cargo.toml build.gradle; do
    if [[ -f "$dir/$marker" ]]; then has_marker=true; break; fi
  done

  if [[ "$src_count" -gt 20 ]] && [[ "$has_marker" == "true" ]]; then
    echo ""
    echo "[SDD-RIPER] 检测到目标项目已存在 ${src_count} 个源码文件，且尚未建立 CodeMap。"
    echo "  建议先建立 CodeMap 再进入 Research，帮助 AI 快速理解模块结构："
    echo "    ./sdd.sh create-codemap $dir [--module <name>]"
  fi
}

# _sdd_section_is_empty <file> <section-pattern>
# Returns 0 (true) if a ## heading matching pattern exists but has no non-comment content.
# Returns 1 (false) if the section has real content or does not exist.
_sdd_section_is_empty() {
  local file="$1" section="$2"
  awk -v section="$section" '
    /^##/ {
      if (in_section) { if (had_content==0) exit 0; else exit 1 }
      if ($0 ~ section) { in_section=1; had_content=0; in_comment=0 }
      else { in_section=0 }
      next
    }
    in_section && /<!--/ { in_comment=1 }
    in_section && /-->/ { in_comment=0; next }
    in_section && !in_comment && NF>0 && !/^<!--/ { had_content=1 }
    END { if (in_section && had_content==0) exit 0; else exit 1 }
  ' "$file" 2>/dev/null
}

# _sdd_subsection_is_empty <file> <h3-pattern>
# Returns 0 (true) if a ### heading matching pattern exists but has no non-comment content.
_sdd_subsection_is_empty() {
  local file="$1" section="$2"
  awk -v section="$section" '
    /^###/ {
      if (in_section) { if (had_content==0) exit 0; else exit 1 }
      if ($0 ~ section) { in_section=1; had_content=0; in_comment=0 }
      else { in_section=0 }
      next
    }
    /^##[^#]/ { if (in_section) { if (had_content==0) exit 0; else exit 1 } in_section=0; next }
    in_section && /<!--/ { in_comment=1 }
    in_section && /-->/ { in_comment=0; next }
    in_section && !in_comment && NF>0 && !/^<!--/ { had_content=1 }
    END { if (in_section && had_content==0) exit 0; else exit 1 }
  ' "$file" 2>/dev/null
}

# _sdd_find_source_spec <dir> <slug> [archived_only]
#   Find the highest-versioned spec matching the given slug in <dir>.
#   Parameters:
#     <dir>: Directory to search (typically specs/)
#     <slug>: Task slug to match (e.g., "user-login")
#     [archived_only]: If "true", only return specs with status: archived (default: false)
#   Returns: Full path to the highest-versioned matching spec, or empty string if not found.
_sdd_find_source_spec() {
  local dir="$1" slug="$2" archived_only="${3:-false}"
  local best_file="" best_major=0 best_minor=-1
  local f bname vmaj vmin file_slug file_status
  while IFS= read -r -d '' f; do
    bname="$(basename "$f")"
    [[ "$bname" == ".gitkeep" ]] && continue
    if [[ "$bname" =~ ^v([0-9]+)\.([0-9]+)-(.+)\.md$ ]]; then
      file_slug="${BASH_REMATCH[3]}"
      vmaj="${BASH_REMATCH[1]}"
      vmin="${BASH_REMATCH[2]}"
      if [[ "$file_slug" == "$slug" ]]; then
        if [[ "$archived_only" == "true" ]]; then
          file_status="$(grep '^status:' "$f" 2>/dev/null | head -1 | sed 's/status: *//; s/#.*$//' | tr -d '[:space:]' || true)"
          [[ "$file_status" != "archived" ]] && continue
        fi
        if (( vmaj > best_major )) || (( vmaj == best_major && vmin > best_minor )); then
          best_major=$vmaj
          best_minor=$vmin
          best_file="$f"
        fi
      fi
    fi
  done < <(find "$dir" -maxdepth 1 -name "*.md" -print0 2>/dev/null)
  echo "$best_file"
}
