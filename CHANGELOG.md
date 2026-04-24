# Changelog

## [0.2.0] - 2026-04-24

### Added
- Per-agent border + label color so multi-agent views are scannable at a glance
- Subagent task description shown in panel header (pulled from `agent-*.meta.json`)
- Cleaner empty state with explanation text
- Tighter status: dot indicator (`●`) for running, `✓` for completed
- Shorter elapsed format (no `started ... ago` prefix)

### Changed
- Removed em dashes throughout (per project style)

## [0.1.0] - 2026-04-23

Initial release.

### Added
- Live terminal dashboard for Claude Code subagent activity
- Auto-discovery of subagent JSONL files under `~/.claude/projects/`
- One panel per active subagent with thinking, tool calls, and replies
- Auto-resize panels to terminal height
- Status indicators: running, completed, idle
- Configurable via `SUBAGENT_WATCH_WINDOW_MS`, `SUBAGENT_WATCH_LINGER_MS`, `SUBAGENT_WATCH_IDLE_MS`
- Pure Node, zero dependencies
- Single-file CLI (`bin/subagent-watch.mjs`)
