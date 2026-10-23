#!/bin/sh
# A PreToolUse hook for illi's shell tool (copy it to ~/.illi/hooks/,
# chmod +x it, and name it in hooks.json; examples/hooks.json does).
# It gets the call as JSON on its input; exit 2 refuses the call, and
# illi's model reads what it wrote to stderr; exit 0 lets illi's own
# checks judge it. Needs jq.

command=$(jq -r '.tool_input.command // ""')

case "$command" in
  *"rm -rf"*)
    echo "rm -rf is refused here: move what should go to a trash folder instead." >&2
    exit 2 ;;
  *"git push"*" main"*|*"git push"*" master"*)
    echo "Pushes to the main branch go through a pull request: push a branch instead." >&2
    exit 2 ;;
esac

# Asked, not refused: a JSON answer on stdout, as Claude Code reads one.
case "$command" in
  *"npm publish"*|*"bun publish"*)
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"publishing a package"}}' ;;
esac
exit 0
