# bin/_common.sh Implementation Learnings

## Successfully Created Pure Utility Functions Library

### Key Implementation Patterns

1. **Function Naming Convention**: All functions prefixed with `_sdd_` for namespace isolation
2. **No Side Effects**: Functions only return values via final `echo` statement
3. **Stderr for Warnings**: Legacy spec warnings use `>&2` redirection to stderr only
4. **Documentation**: Each function has header comments with parameter descriptions and return value semantics

### Three Core Functions

#### `_sdd_next_version <dir> <name>`
- Scans directory for versioned specs matching pattern `v{N}.{M}-{name}.md`
- Returns `v1.0` if no matching specs exist
- Returns `v{major}.{minor+1}` for subsequent calls
- Uses BASH_REMATCH for version extraction

#### `_sdd_find_latest_spec <specs_dir>`
- Two-step algorithm:
  1. Scan all versioned specs, track max mtime per task name
  2. Find task with highest mtime, then find highest version of that task
- Detects legacy unversioned specs (not matching `v{N}.{M}-name.md` pattern)
- Emits `[WARN] Legacy unversioned spec found: <filename>` to stderr for legacy files
- Returns full path to selected spec or empty string

#### `_sdd_find_source_spec <dir> <slug> [archived_only]`
- Finds highest-versioned spec matching given slug
- Optional third parameter `archived_only` (default: `false`)
- When `archived_only=true`, only returns specs with `status: archived` frontmatter
- Returns full path to highest-versioned match or empty string

### Technical Decisions

1. **Associative Arrays**: Used `declare -A` for task mtime tracking (bash 4+ feature)
2. **Process Substitution**: Used `< <(find ...)` for null-delimited file reading
3. **Stat Compatibility**: Used `stat -c '%Y'` (Linux) with fallback to `stat -f '%m'` (macOS)
4. **Regex Matching**: Leveraged BASH_REMATCH for version number extraction
5. **Status Extraction**: Used `grep | sed | tr` pipeline to extract and normalize status field

### Testing Considerations

- Functions work with empty directories (return v1.0 or empty string)
- Functions handle .gitkeep files correctly (skipped in _sdd_find_source_spec)
- Legacy spec detection works for any .md file not matching version pattern
- Archived status filtering requires exact "archived" value (case-sensitive, whitespace-trimmed)
