#!/bin/bash
# _common.sh: Pure utility functions library for sdd-riper
# No side effects on stdout; only returns values via final echo.
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
