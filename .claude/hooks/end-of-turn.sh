#!/usr/bin/env bash
# Stop: lint + run related unit tests for every file changed in the working tree, once per turn.
# Covers files written by Bash, which the per-edit hooks never see. Exit 2 + stderr sends the agent back once.
export NO_COLOR=1 FORCE_COLOR=0
command -v jq >/dev/null || { echo "Hook end-of-turn.sh needs jq: install it or port the hook to Node." >&2; exit 2; }

INPUT=$(cat)
ACTIVE=$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)
LOOPS=$(printf '%s' "$INPUT" | jq -r '.loop_count // 0' 2>/dev/null)
# One retry only: when the agent is already continuing because of a Stop hook, let it finish.
[ "$ACTIVE" = "true" ] && exit 0
case "$LOOPS" in '' | *[!0-9]*) ;; *) [ "$LOOPS" -gt 0 ] && exit 0 ;; esac

CWD=$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null)
RAW_SID=$(printf '%s' "$INPUT" | jq -r '.session_id // empty' 2>/dev/null | tr -cd 'A-Za-z0-9_-')
SID=${RAW_SID:-nosession}
STATE="${TMPDIR:-/tmp}/claude-hooks"
# No session id → no registered roots: never trust a predictable shared file.
ROOTS_FILE=""
[ -n "$RAW_SID" ] && ROOTS_FILE="$STATE/$SID.roots"

# Checkouts to sweep: the session cwd's checkout plus every checkout the per-edit hooks registered.
CANDIDATES=()
TOP=$(git -C "${CWD:-$PWD}" rev-parse --show-toplevel 2>/dev/null) && CANDIDATES+=("$TOP")
if [ -f "$ROOTS_FILE" ]; then
  while IFS= read -r line; do
    [ -n "$line" ] && CANDIDATES+=("$line")
  done <"$ROOTS_FILE"
fi
ROOTS=()
for c in "${CANDIDATES[@]}"; do
  [ -d "$c" ] || continue
  dup=0
  for r in "${ROOTS[@]}"; do [ "$r" = "$c" ] && dup=1; done
  [ "$dup" = 1 ] || ROOTS+=("$c")
done

truncate_roots() { [ -f "$ROOTS_FILE" ] && : >"$ROOTS_FILE"; return 0; }

LINT_RE='\.(ts|tsx|js|jsx|mjs|cjs|astro)$'
TEST_RE='\.(ts|tsx|js|jsx|mjs|cjs)$'
# Above this many lintable files per checkout the sweep is skipped (argv limits, 120 s timeout); CI lints the tree.
MAX_FILES=${HOOK_SWEEP_MAX_FILES:-200}
case "$MAX_FILES" in '' | *[!0-9]*) MAX_FILES=200 ;; esac
NOTES=""

# Per-checkout state of the run, parallel arrays indexed like TODO_ROOTS.
TODO_ROOTS=()
TODO_FP_FILES=()
TODO_FPS=()
TODO_LINT=()
TODO_TEST=()

for root in "${ROOTS[@]}"; do
  # Unborn HEAD (fresh repo, orphan branch): diff against the empty tree so staged files are still swept.
  BASE=HEAD
  git -C "$root" rev-parse --verify -q HEAD >/dev/null || BASE=$(git -C "$root" hash-object -t tree /dev/null)
  FILES=()
  while IFS= read -r -d '' f; do
    [ -f "$root/$f" ] && FILES+=("$f")
  done < <({
    git -C "$root" diff --name-only -z "$BASE" 2>/dev/null
    git -C "$root" ls-files --others --exclude-standard -z 2>/dev/null
  } | sort -zu)
  [ "${#FILES[@]}" -gt 0 ] || continue

  LINT=()
  TEST=()
  for f in "${FILES[@]}"; do
    [[ $f =~ $LINT_RE ]] && LINT+=("./$f")
    [[ $f =~ $TEST_RE ]] && TEST+=("./$f")
  done
  [ "${#LINT[@]}" -gt 0 ] || continue
  if [ "${#LINT[@]}" -gt "$MAX_FILES" ]; then
    NOTES+="Sweep skipped for $root: ${#LINT[@]} changed lintable files (cap $MAX_FILES); run npm run lint or rely on CI."$'\n'
    continue
  fi

  # Fingerprint: tracked diff + untracked lintable files by path and content hash.
  UNTRACKED=()
  while IFS= read -r -d '' f; do
    [[ $f =~ $LINT_RE ]] && [ -f "$root/$f" ] && UNTRACKED+=("$f")
  done < <(git -C "$root" ls-files --others --exclude-standard -z 2>/dev/null | sort -z)
  FP=$({
    git -C "$root" diff "$BASE" 2>/dev/null
    if [ "${#UNTRACKED[@]}" -gt 0 ]; then
      printf '%s\n' "${UNTRACKED[@]}"
      printf '%s\n' "${UNTRACKED[@]}" | git -C "$root" hash-object --stdin-paths 2>/dev/null
    fi
  } | sha1sum | cut -d' ' -f1)
  FP_FILE="$STATE/$SID.$(printf '%s' "$root" | sha1sum | cut -c1-12).fp"
  [ -f "$FP_FILE" ] && [ "$(cat "$FP_FILE" 2>/dev/null)" = "$FP" ] && continue

  TODO_ROOTS+=("$root")
  TODO_FP_FILES+=("$FP_FILE")
  TODO_FPS+=("$FP")
  TODO_LINT+=("$(printf '%s\n' "${LINT[@]}")")
  TODO_TEST+=("$(printf '%s\n' "${TEST[@]}")")
done

if [ "${#TODO_ROOTS[@]}" -eq 0 ]; then
  [ -n "$NOTES" ] && printf '%s' "$NOTES" >&2
  truncate_roots
  exit 0
fi

FAILED=0
REPORT=""
for i in "${!TODO_ROOTS[@]}"; do
  root=${TODO_ROOTS[$i]}
  mapfile -t LINT <<<"${TODO_LINT[$i]}"
  mapfile -t TEST <<<"${TODO_TEST[$i]}"
  cd "$root" || continue

  if ! OUTPUT=$(npx --no-install eslint --quiet --no-warn-ignored "${LINT[@]}" 2>&1 </dev/null); then
    FAILED=1
    REPORT+="ESLint reported errors in changed files of $root:"$'\n'"$OUTPUT"$'\n'
  fi
  if [ -n "${TEST[0]}" ]; then
    if ! OUTPUT=$(npx --no-install vitest related "${TEST[@]}" --run --project unit 2>&1 </dev/null); then
      FAILED=1
      REPORT+="Related unit tests failed for changed files of $root:"$'\n'"$OUTPUT"$'\n'
    fi
  fi
done

if [ "$FAILED" = 1 ]; then
  printf '%s' "$REPORT" >&2
  exit 2
fi

# Green: remember the state and stop sweeping sibling checkouts on later turns.
if mkdir -p -m 700 "$STATE"; then
  for i in "${!TODO_ROOTS[@]}"; do
    printf '%s\n' "${TODO_FPS[$i]}" >"${TODO_FP_FILES[$i]}"
  done
fi
[ -n "$NOTES" ] && printf '%s' "$NOTES" >&2
truncate_roots
exit 0
