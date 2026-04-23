# subagent-watch

> Live terminal dashboard for Claude Code subagent activity. See thinking, tool calls, and replies of every Task subagent in real time.

## The problem

When Claude Code's main agent uses the `Task` tool to spawn a subagent, **you can't see what the subagent is doing**. The main pane just shows "Task running..." and eventually the final summary. The subagent's actual thinking, tool calls, and intermediate work never appear in your terminal.

The data is being written to disk, at:

```
~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl
```

But no UI surfaces it. So you sit there guessing what the subagents are up to.

## The solution

`subagent-watch` tails those files and renders one panel per active subagent in a single terminal window. Pin it to a tmux pane and you can see every subagent's live work at a glance.

```
subagent-watch  1 subagent                                    12:26:31 PM
─────────────────────────────────────────────────────────────────────────
╭─ NUBES ↳ a4f8db5 ──────────────── started 41s ago · running ──────────╮
│ ↑ 1 earlier event                                                       │
│ 🔧 TOOL  Bash 40s ago                                                   │
│   ls /Users/mastermac/Desktop/NUBES/apps/web/convex/*.ts                │
│                                                                         │
│ 💬 SAY   35s ago                                                        │
│   Step 3: Found 36 .ts files. Let me pick `extractionRetryCron.ts`      │
│   since the project context referenced it as an interesting cron file,  │
│   and read it.                                                          │
│                                                                         │
│ 🔧 TOOL  Read 34s ago                                                   │
│   /Users/mastermac/Desktop/NUBES/apps/web/convex/extractionRetryCron.ts │
│                                                                         │
│ 💬 SAY   29s ago                                                        │
│   Step 4: Thinking about what it does. This is a Convex internal        │
│   action (`retryStuckExtractions`) triggered by a cron every 2 hours... │
╰─────────────────────────────────────────────────────────────────────────╯

[q]uit · auto-refresh 1s · completed agents linger 30s
```

## Install

### From npm (coming soon)

```sh
npm install -g subagent-watch
```

### From source (today)

```sh
git clone https://github.com/MikeSewell/subagent-watch.git
cd subagent-watch
chmod +x bin/subagent-watch.mjs
ln -s "$(pwd)/bin/subagent-watch.mjs" ~/.local/bin/subwatch
# (or any directory on your $PATH)
```

Requires Node 18+. Zero npm dependencies.

## Run

```sh
subwatch
```

That's the whole interface. It auto-discovers active subagents and renders them. Press `q` or Ctrl-C to quit.

## What you see

Each panel represents one active subagent.

- **Header:** parent repo name + subagent ID + how long it's been running + status (running / completed)
- **🤔 THINK:** the subagent's internal reasoning, full text wrapped to fit the panel
- **🔧 TOOL:** tool name + the actual relevant arguments (Bash command, file path, grep pattern, etc.)
- **💬 SAY:** what the subagent says (or its final reply to the parent)

When too many events to fit, you see the most recent N plus an "↑ N earlier events" indicator. When a single event is taller than the panel, it gets truncated with `...`.

When a subagent finishes, its panel sticks around for 30 seconds with a `✓ completed` marker, then drops off.

## Configuration

All optional, set as environment variables:

| Variable | Default | What it does |
|---|---|---|
| `SUBAGENT_WATCH_WINDOW_MS` | `1800000` (30 min) | How recent a subagent file must be to show |
| `SUBAGENT_WATCH_LINGER_MS` | `30000` (30 s) | How long completed agents stay visible |
| `SUBAGENT_WATCH_IDLE_MS` | `5000` (5 s) | Idle time + final text-only event marks completion |

Example: keep subagents from the last 4 hours visible:

```sh
SUBAGENT_WATCH_WINDOW_MS=14400000 subwatch
```

## How it works

1. Scans `~/.claude/projects/*/*/subagents/*.jsonl` for files modified within the active window.
2. Polls each file every 500ms for new bytes appended.
3. Parses each new JSONL event; extracts the relevant fields (thinking text, tool name + input, assistant text).
4. Renders a panel per subagent, auto-resized to fit the terminal height.
5. Refreshes the screen every second.

Pure Node, no npm dependencies. ~400 lines.

## When it shows things vs. not

`subagent-watch` shows panels **only when an agent actually uses the Task tool to spawn a subagent.** If your main agent is just running Bash, Edit, Read, etc. directly, no subagents exist and the screen will say "no active subagents."

Subagents typically appear when:

- A skill explicitly delegates work (parallel research, multi-step exploration)
- You ask Claude to "research X in parallel" or "use 3 agents to look at Y, Z, W"
- The agent decides to use Task for a complex sub-investigation
- Slash commands like `/ultrareview` that spawn many agents

For visibility into the **main agent's** activity, just look at its cmux/tmux pane directly. Claude Code shows its own tool calls there.

## How this differs from similar tools

- **[agtrace](https://github.com/lanegrid/agtrace)** is a **per-session** viewer with context saturation, turn history, and recent steps. Watches one main session at a time. `subagent-watch` is the inverse: it ignores main sessions and surfaces only the subagent activity that no other tool shows.
- **[claude-hud](https://github.com/jarrodwatts/claude-hud)** is an in-terminal HUD overlay for one Claude Code session.
- **[ccusage](https://github.com/ryoppippi/ccusage)** is a usage / cost analyzer (post-hoc, not live).
- **[claude-replay](https://github.com/es617/claude-replay)** turns finished sessions into HTML video replays.

`subagent-watch` is narrower than any of these. Single job: show subagents live.

## Contributing

PRs welcome. Open an issue first for anything substantial. Keep the tool single-file and dependency-free unless there's a strong reason to add either.

## License

MIT. See [LICENSE](LICENSE).
