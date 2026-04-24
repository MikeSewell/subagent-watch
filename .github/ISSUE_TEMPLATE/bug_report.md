---
name: Bug report
about: Something isn't working as expected
title: ''
labels: bug
assignees: MikeSewell
---

**What happened**
A clear and concise description of what went wrong.

**What you expected**
What you thought should have happened instead.

**Reproduce**
Steps to reproduce the behavior:
1. Ran `subwatch` in [terminal]
2. Spawned a Task subagent in [Claude Code session / cmux]
3. Saw [unexpected behavior]

**Environment**
- macOS version:
- Node version (`node --version`):
- Terminal emulator (Ghostty, iTerm2, Terminal.app, cmux):
- subagent-watch version (`cat package.json | grep version`):

**Logs / JSONL snippet**
If it's a parser issue, paste the offending line from the subagent JSONL (redact paths if needed).
