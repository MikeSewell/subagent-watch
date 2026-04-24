# Contributing to subagent-watch

Thanks for your interest. Issues and PRs are welcome.

## Bug reports

Open a [GitHub issue](https://github.com/MikeSewell/subagent-watch/issues) with:

- macOS version, Node version (`node --version`), terminal emulator
- What you ran and what happened (vs. what you expected)
- A snippet of the offending JSONL line if it's a parser issue (redact paths if needed)

## Pull requests

Before opening a PR for anything beyond a typo or bug fix, please open an issue first to discuss the approach. This avoids wasted work on either side.

When you do open a PR:

- Keep changes focused. One PR, one concern.
- Don't add npm dependencies. The whole point is single-file zero-dep. If you genuinely need one, open an issue first.
- Don't reformat unrelated code.
- Test against real subagent JSONL files in `~/.claude/projects/*/*/subagents/`.

## Code style

- Single-file CLI in `bin/subagent-watch.mjs`. Don't break that out unless we agree to.
- Pure Node, no transpilation step.
- No emojis in code or commit messages unless they're meaningful UI elements (the existing 🤔 / 🔧 / 💬 are part of the UI, that's fine).
- No em dashes in code, comments, or text. Use regular dashes.
- Prefer clarity over cleverness.

## Running locally

```sh
git clone https://github.com/MikeSewell/subagent-watch.git
cd subagent-watch
node bin/subagent-watch.mjs
```

To test against subagent activity, spawn a Task subagent in any Claude Code session and watch the panel appear.

## Scope

This tool is deliberately narrow:

- It shows **subagent** activity. Not main agent activity (that's already visible in the cmux/tmux pane). Not session metadata (that's [agtrace](https://github.com/lanegrid/agtrace)).
- It tails JSONL files. It does not use Claude Code hooks, telemetry, or any cloud service.
- It is local-first and zero-config.

PRs that expand scope beyond this are likely to be declined. Open an issue first if you want to argue for one.
