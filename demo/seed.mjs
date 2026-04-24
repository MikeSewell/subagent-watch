#!/usr/bin/env node
// demo/seed.mjs — generate fake subagent JSONL files for the demo recording.
// Produces a realistic snapshot of 3 subagents with thinking, tool calls, and replies.
// Output dir is the first argv (default: $TMPDIR/subagent-watch-demo).

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = process.argv[2] || join(tmpdir(), "subagent-watch-demo");
const projectsDir = join(root, "projects");

const now = Date.now();
const t = (sAgo) => new Date(now - sAgo * 1000).toISOString();

const agents = [
  {
    project: "-Users-demo-NUBES",
    sessionId: "11111111-1111-1111-1111-111111111111",
    cwd: "/Users/demo/NUBES",
    agentId: "a8069d3f83556b9d5",
    description: "Find callers of getDailyBrief and check filters",
    events: [
      { sAgo: 55, type: "thinking", text: "The user wants me to refactor getDailyBrief to support per-client filtering. Let me find all callers first to know what filter params they pass." },
      { sAgo: 45, type: "tool_use", name: "Grep", input: { pattern: "getDailyBrief", path: "apps/web/" } },
      { sAgo: 35, type: "thinking", text: "Found 3 callers. The /dashboard page passes no filter, /clients/[id] passes clientId, /api/cron/dailyDigest passes both depending on env. I will add a default value." },
      { sAgo: 22, type: "tool_use", name: "Read", input: { file_path: "apps/web/convex/dailyBrief.ts" } },
      { sAgo: 10, type: "tool_use", name: "Edit", input: { file_path: "apps/web/convex/dailyBrief.ts", old_string: "x".repeat(120), new_string: "y".repeat(180) } },
      { sAgo: 3, type: "tool_use", name: "Bash", input: { command: "cd apps/web && npx tsc --noEmit" } },
    ],
  },
  {
    project: "-Users-demo-Scheduler",
    sessionId: "22222222-2222-2222-2222-222222222222",
    cwd: "/Users/demo/Scheduler",
    agentId: "b1234fg9d2c8a712a",
    description: "Align intake schema with wizard payload",
    events: [
      { sAgo: 40, type: "thinking", text: "The intake form schema needs to match what the wizard sends. Reading both sides to find the diffs." },
      { sAgo: 30, type: "tool_use", name: "Read", input: { file_path: "apps/web/convex/schema.ts" } },
      { sAgo: 22, type: "tool_use", name: "Read", input: { file_path: "apps/web/components/IntakeWizard.tsx" } },
      { sAgo: 12, type: "thinking", text: "Wizard sends 4 fields the schema does not have: phone, address, followUpDate, referralSource. Adding them with the right validators." },
      { sAgo: 2, type: "tool_use", name: "Edit", input: { file_path: "apps/web/convex/schema.ts", old_string: "x".repeat(50), new_string: "y".repeat(120) } },
    ],
  },
  {
    project: "-Users-demo-grant-wizard",
    sessionId: "33333333-3333-3333-3333-333333333333",
    cwd: "/Users/demo/grant-wizard",
    agentId: "c9201f7a3e44b8c0d",
    description: "Verify scoring math against test fixtures",
    events: [
      { sAgo: 32, type: "thinking", text: "Need to verify the scoring math against the test fixtures." },
      { sAgo: 22, type: "tool_use", name: "Read", input: { file_path: "__tests__/fixtures/grants.json" } },
      { sAgo: 12, type: "tool_use", name: "Bash", input: { command: "npm test -- scoring" } },
      { sAgo: 4, type: "text", text: "All 14 scoring tests pass. The math is correct: weighted sum with eligibility multiplier produces values in [0, 100] for every fixture." },
    ],
  },
];

function buildEvent(ev, agentMeta) {
  const base = {
    cwd: agentMeta.cwd,
    sessionId: agentMeta.sessionId,
    isSidechain: true,
    timestamp: t(ev.sAgo),
  };
  if (ev.type === "thinking") {
    return {
      ...base,
      type: "assistant",
      message: { model: "claude-opus-4-7", content: [{ type: "thinking", thinking: ev.text }] },
    };
  }
  if (ev.type === "text") {
    return {
      ...base,
      type: "assistant",
      message: { model: "claude-opus-4-7", content: [{ type: "text", text: ev.text }] },
    };
  }
  if (ev.type === "tool_use") {
    return {
      ...base,
      type: "assistant",
      message: { model: "claude-opus-4-7", content: [{ type: "tool_use", id: "toolu_demo_" + Math.random().toString(36).slice(2, 10), name: ev.name, input: ev.input }] },
    };
  }
  return null;
}

await mkdir(projectsDir, { recursive: true });

for (const a of agents) {
  const projDir = join(projectsDir, a.project);
  const subagentsDir = join(projDir, a.sessionId, "subagents");
  await mkdir(subagentsDir, { recursive: true });

  // Parent session JSONL (used by resolveRepo to find the cwd)
  const parentEvent = {
    cwd: a.cwd,
    sessionId: a.sessionId,
    type: "assistant",
    timestamp: t(120),
    message: { model: "claude-opus-4-7", content: [{ type: "text", text: "starting" }] },
  };
  await writeFile(join(projDir, a.sessionId + ".jsonl"), JSON.stringify(parentEvent) + "\n");

  // Subagent meta.json (description shown in panel header)
  await writeFile(
    join(subagentsDir, `agent-${a.agentId}.meta.json`),
    JSON.stringify({ agentType: "general-purpose", description: a.description }),
  );

  // Subagent JSONL events
  const lines = a.events.map((e) => JSON.stringify(buildEvent(e, a))).join("\n") + "\n";
  await writeFile(join(subagentsDir, `agent-${a.agentId}.jsonl`), lines);
}

console.log(`SUBAGENT_WATCH_PROJECTS_DIR=${projectsDir}`);
