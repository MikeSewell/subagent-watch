#!/usr/bin/env node
// subagent-watch — live detail panel per running Claude Code subagent.
// One terminal window. One panel per active subagent. Full thinking text,
// tool calls with their actual arguments, subagent speech. No truncation.

import { readdir, stat, open, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, basename, dirname } from "node:path";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");
const ACTIVE_WINDOW_MS = Number(process.env.SUBAGENT_WATCH_WINDOW_MS ?? 30 * 60 * 1000);
const COMPLETED_LINGER_MS = Number(process.env.SUBAGENT_WATCH_LINGER_MS ?? 30 * 1000);
const COMPLETION_IDLE_MS = Number(process.env.SUBAGENT_WATCH_IDLE_MS ?? 5 * 1000);
const POLL_MS = 500;
const RENDER_MS = 1000;
const MAX_EVENTS_IN_MEMORY = 500;

const ANSI = {
  reset: "\x1b[0m", dim: "\x1b[2m", bold: "\x1b[1m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brightGreen: "\x1b[92m", brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m", brightMagenta: "\x1b[95m", brightCyan: "\x1b[96m",
  clearScreen: "\x1b[2J", cursorHome: "\x1b[H", clearToEnd: "\x1b[J",
  hideCursor: "\x1b[?25l", showCursor: "\x1b[?25h",
};
const C = (col, s) => col + s + ANSI.reset;
const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, "");
const visualLen = s => stripAnsi(s).length;

// Stable per-agent color assignment so multi-agent views are scannable
const AGENT_COLORS = [
  ANSI.cyan, ANSI.magenta, ANSI.yellow, ANSI.green,
  ANSI.brightCyan, ANSI.brightMagenta, ANSI.brightYellow, ANSI.brightBlue,
];
function colorForId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AGENT_COLORS[h % AGENT_COLORS.length];
}

function ago(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

function clean(s) {
  if (!s) return "";
  return String(s).replace(/\r/g, "").replace(/\t/g, "  ");
}

function wrap(text, width) {
  text = clean(text);
  const out = [];
  for (const para of text.split("\n")) {
    if (!para) { out.push(""); continue; }
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      if ((line + w).length > width) {
        if (line) { out.push(line.trimEnd()); line = w.trimStart(); }
        else {
          for (let i = 0; i < w.length; i += width) out.push(w.slice(i, i + width));
          line = "";
        }
      } else {
        line += w;
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  return out;
}

function summarizeEdit(input) {
  const oldLen = (input.old_string || "").length;
  const newLen = (input.new_string || "").length;
  const replaceAll = input.replace_all ? " (replace_all)" : "";
  const file = input.file_path || "";
  return `${file}\n${oldLen}→${newLen} chars${replaceAll}`;
}

function describe(ev) {
  if (!ev || (ev.type !== "assistant" && ev.type !== "user")) return null;
  const t = ev.timestamp ? new Date(ev.timestamp).getTime() : Date.now();

  if (ev.type === "assistant" && ev.message?.content) {
    for (const c of ev.message.content) {
      if (c.type === "thinking") return { kind: "think", body: c.thinking || "", ts: t };
      if (c.type === "text" && c.text) return { kind: "say", body: c.text, ts: t };
      if (c.type === "tool_use") {
        const i = c.input || {};
        let body = "";
        switch (c.name) {
          case "Bash": body = i.command || ""; break;
          case "Edit": body = summarizeEdit(i); break;
          case "Write": body = i.file_path || ""; break;
          case "Read": body = i.file_path || ""; break;
          case "Grep": body = `pattern: "${i.pattern || ""}"` + (i.path ? `\nin: ${i.path}` : ""); break;
          case "Glob": body = i.pattern || ""; break;
          case "WebFetch": body = i.url || ""; break;
          case "WebSearch": body = i.query || ""; break;
          case "Task": case "Agent": body = i.description || (i.prompt || "").slice(0, 200); break;
          case "TodoWrite": case "TaskCreate": case "TaskUpdate": {
            const todos = i.todos || i.tasks || [];
            if (Array.isArray(todos)) {
              const inProg = todos.find(x => x.status === "in_progress");
              body = inProg ? `→ ${inProg.content || inProg.description || ""}` : `${todos.length} task(s)`;
            } else body = JSON.stringify(i).slice(0, 300);
            break;
          }
          default: body = JSON.stringify(i).slice(0, 300);
        }
        return { kind: "tool", tool: c.name, body, ts: t };
      }
    }
  }
  return null;
}

class SubagentState {
  constructor(filePath) {
    this.filePath = filePath;
    this.subagentId = basename(filePath, ".jsonl").replace(/^agent-/, "").slice(0, 7);
    this.repo = "?";
    this.agentType = null;
    this.description = null;
    this.events = [];
    this.startedAt = null;
    this.lastEventAt = null;
    this.fileSize = 0;
    this.completedAt = null;
  }
  get status() { return this.completedAt ? "completed" : "running"; }
}

async function readMeta(subagentFilePath) {
  const metaPath = subagentFilePath.replace(/\.jsonl$/, ".meta.json");
  try {
    const text = await readFile(metaPath, "utf8");
    const meta = JSON.parse(text);
    return { agentType: meta.agentType || null, description: meta.description || null };
  } catch {
    return { agentType: null, description: null };
  }
}

const states = new Map();
const repoCache = new Map();
let quitting = false;

async function resolveRepo(parentSessionFile) {
  if (repoCache.has(parentSessionFile)) return repoCache.get(parentSessionFile);
  let repo = null;
  try {
    const fh = await open(parentSessionFile, "r");
    try {
      const buf = Buffer.alloc(64 * 1024);
      const { bytesRead } = await fh.read(buf, 0, 64 * 1024, 0);
      for (const line of buf.subarray(0, bytesRead).toString("utf8").split("\n")) {
        if (!line.trim()) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.cwd) {
          const m = ev.cwd.match(/([^/]+)\/\.worktrees\/([^/]+)$/);
          repo = m ? `${m[1]}/${m[2]}` : (ev.cwd.split("/").filter(Boolean).pop() || null);
          break;
        }
      }
    } finally { await fh.close(); }
  } catch {}
  if (!repo) {
    const projectDirName = basename(dirname(parentSessionFile));
    const path = projectDirName.startsWith("-") ? projectDirName.slice(1).replace(/-/g, "/") : projectDirName;
    repo = path.split("/").filter(Boolean).pop() || projectDirName;
  }
  repoCache.set(parentSessionFile, repo);
  return repo;
}

async function readNewEvents(state) {
  let st;
  try { st = await stat(state.filePath); } catch { return; }
  if (st.size === state.fileSize) return;
  if (st.size < state.fileSize) state.fileSize = 0;
  const start = state.fileSize;
  const len = st.size - start;
  if (len <= 0) { state.fileSize = st.size; return; }

  const fh = await open(state.filePath, "r");
  try {
    const buf = Buffer.alloc(len);
    await fh.read(buf, 0, len, start);
    state.fileSize = st.size;
    const text = buf.toString("utf8");
    const lines = text.split("\n").filter(Boolean);
    for (const line of lines) {
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const desc = describe(ev);
      if (!desc) continue;
      state.events.push(desc);
      if (state.events.length > MAX_EVENTS_IN_MEMORY) {
        state.events = state.events.slice(-MAX_EVENTS_IN_MEMORY);
      }
      if (!state.startedAt) state.startedAt = desc.ts;
      state.lastEventAt = desc.ts;
    }
  } finally {
    await fh.close();
  }
}

async function discover() {
  const found = [];
  const now = Date.now();
  async function scan(dir, depth = 0) {
    if (depth > 4) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        await scan(p, depth + 1);
      } else if (e.name.endsWith(".jsonl") && p.includes("/subagents/")) {
        try {
          const s = await stat(p);
          if (now - s.mtimeMs < ACTIVE_WINDOW_MS) found.push(p);
        } catch {}
      }
    }
  }
  await scan(PROJECTS_DIR);
  return found;
}

async function syncStates() {
  const found = await discover();
  for (const p of found) {
    if (!states.has(p)) {
      const sessionDir = dirname(dirname(p));
      const parentSessionFile = sessionDir + ".jsonl";
      const state = new SubagentState(p);
      state.repo = await resolveRepo(parentSessionFile);
      const meta = await readMeta(p);
      state.agentType = meta.agentType;
      state.description = meta.description;
      states.set(p, state);
    }
  }
  await Promise.all([...states.values()].map(s => readNewEvents(s).catch(() => {})));

  const now = Date.now();
  for (const s of states.values()) {
    if (s.completedAt) continue;
    if (!s.lastEventAt) continue;
    const idle = now - s.lastEventAt;
    if (idle >= COMPLETION_IDLE_MS) {
      const last = s.events[s.events.length - 1];
      if (last && last.kind === "say") s.completedAt = s.lastEventAt;
    }
  }
  for (const [p, s] of states.entries()) {
    if (s.completedAt && now - s.completedAt > COMPLETED_LINGER_MS) states.delete(p);
  }
}

function renderEvent(ev, innerW) {
  const time = `${ago(Date.now() - ev.ts)} ago`;
  let head, bodyText;
  switch (ev.kind) {
    case "think": head = `${C(ANSI.magenta, "🤔 THINK")} ${C(ANSI.dim, time)}`; bodyText = ev.body; break;
    case "tool":  head = `${C(ANSI.cyan, "🔧 TOOL")}  ${C(ANSI.bold, ev.tool)} ${C(ANSI.dim, time)}`; bodyText = ev.body; break;
    case "say":   head = `${C(ANSI.brightGreen, "💬 SAY")}   ${C(ANSI.dim, time)}`; bodyText = ev.body; break;
    default:      head = `? ${time}`; bodyText = ev.body || "";
  }
  const block = [head];
  for (const ln of wrap(bodyText, innerW - 2)) block.push("  " + ln);
  return block;
}

function truncateMid(s, max) {
  if (!s) return "";
  s = String(s).replace(/\s+/g, " ").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function panelHeader(state, width) {
  const color = colorForId(state.subagentId);
  const id = `${state.repo} ↳ ${state.subagentId}`;
  const elapsed = state.startedAt ? `${ago(Date.now() - state.startedAt)}` : "starting…";
  const status = state.completedAt
    ? `${C(ANSI.brightGreen, "✓")} ${ago(Date.now() - state.completedAt)} ago`
    : C(ANSI.brightGreen, "● running");

  // Build title: "<id> · "<description>""  (description optional)
  // Reserve room for elapsed + status + borders + spacing
  const right = ` ${C(ANSI.dim, elapsed)} · ${status} ${C(color, "─╮")}`;
  const leftPrefix = `${C(color, "╭─")} ${C(ANSI.bold + color, id)}`;
  const fixedLen = visualLen(leftPrefix) + visualLen(right) + 4; // 4 for spacing/fill min
  let descPart = "";
  if (state.description) {
    const room = Math.max(0, width - fixedLen);
    if (room > 8) {
      const desc = truncateMid(state.description, room);
      descPart = ` ${C(ANSI.dim, "·")} ${C(color, '"' + desc + '"')}`;
    }
  }
  const left = `${leftPrefix}${descPart} `;
  const fillW = Math.max(2, width - visualLen(left) - visualLen(right));
  const fill = C(color, "─".repeat(fillW));
  return left + fill + right;
}

function panelFooter(state, width) {
  const color = colorForId(state.subagentId);
  return C(color, "╰" + "─".repeat(width - 2) + "╯");
}

function renderPanel(state, width, totalLines) {
  const color = colorForId(state.subagentId);
  const lines = [panelHeader(state, width)];
  const innerW = width - 4;
  const bodyLines = Math.max(1, totalLines - 2);

  const allBlocks = state.events.map(e => renderEvent(e, innerW));
  const flat = [];
  let included = 0;
  for (let i = allBlocks.length - 1; i >= 0; i--) {
    let block = allBlocks[i];
    const sep = flat.length > 0 ? 1 : 0;
    const room = bodyLines - flat.length - sep;
    if (room <= 0) break;
    if (block.length > room) {
      if (included === 0) {
        block = block.slice(0, room - 1).concat([C(ANSI.dim, "  …")]);
      } else {
        break;
      }
    }
    if (sep) flat.unshift("");
    for (let j = block.length - 1; j >= 0; j--) flat.unshift(block[j]);
    included++;
  }
  const dropped = allBlocks.length - included;
  if (dropped > 0 && flat.length + 1 <= bodyLines) {
    flat.unshift(C(ANSI.dim, `↑ ${dropped} earlier event${dropped === 1 ? "" : "s"}`));
  }
  while (flat.length < bodyLines) flat.push("");
  if (flat.length > bodyLines) flat.length = bodyLines;

  const bar = C(color, "│");
  for (const ln of flat) {
    const padding = " ".repeat(Math.max(0, innerW - visualLen(ln)));
    lines.push(`${bar} ${ln}${padding} ${bar}`);
  }
  lines.push(panelFooter(state, width));
  return lines;
}

function renderFrame() {
  const cols = process.stdout.columns || 100;
  const rows = process.stdout.rows || 30;

  const list = [...states.values()].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
    return (a.startedAt || 0) - (b.startedAt || 0);
  });

  let out = ANSI.cursorHome;

  const headerL = `${C(ANSI.bold + ANSI.cyan, "subagent-watch")}  ${C(ANSI.dim, `${list.length} subagent${list.length === 1 ? "" : "s"}`)}`;
  const headerR = C(ANSI.dim, new Date().toLocaleTimeString());
  const headerPad = Math.max(1, cols - visualLen(headerL) - visualLen(headerR));
  out += headerL + " ".repeat(headerPad) + headerR + "\n";
  out += C(ANSI.dim, "─".repeat(cols)) + "\n";

  const reservedTop = 2;
  const reservedBot = 1;
  const available = Math.max(3, rows - reservedTop - reservedBot);

  if (list.length === 0) {
    const lines = [
      C(ANSI.dim, "no active subagents"),
      "",
      C(ANSI.dim, "waiting for Task spawns from any Claude Code session"),
      C(ANSI.dim, "(panels appear here the moment a subagent starts writing events)"),
    ];
    const top = Math.max(0, Math.floor(available / 2) - Math.ceil(lines.length / 2));
    for (let i = 0; i < top; i++) out += "\n";
    let used = top;
    for (const ln of lines) {
      const pad = Math.max(0, Math.floor((cols - visualLen(ln)) / 2));
      out += " ".repeat(pad) + ln + "\n";
      used++;
    }
    while (used < available) { out += "\n"; used++; }
  } else {
    const N = list.length;
    const perPanelTotal = Math.floor(available / N);
    const remainder = available - perPanelTotal * N;
    let used = 0;
    for (let i = 0; i < N; i++) {
      const total = Math.max(3, perPanelTotal + (i < remainder ? 1 : 0));
      const panel = renderPanel(list[i], cols, total);
      for (const ln of panel) out += ln + "\n";
      used += panel.length;
    }
    while (used < available) { out += "\n"; used++; }
  }

  out += ANSI.clearToEnd;
  out += C(ANSI.dim, "[q]uit · auto-refresh 1s · completed agents linger 30s");
  process.stdout.write(out);
}

function quit() {
  if (quitting) return;
  quitting = true;
  process.stdout.write(ANSI.showCursor + ANSI.clearScreen + ANSI.cursorHome + ANSI.reset);
  process.exit(0);
}

async function main() {
  process.stdout.write(ANSI.hideCursor + ANSI.clearScreen + ANSI.cursorHome);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (data) => {
      const s = data.toString();
      if (s === "q" || s === "\x03") quit();
    });
  }
  process.on("SIGINT", quit);
  process.on("SIGTERM", quit);

  await syncStates();
  renderFrame();
  setInterval(() => { if (!quitting) syncStates().catch(() => {}); }, POLL_MS);
  setInterval(() => { if (!quitting) { try { renderFrame(); } catch {} } }, RENDER_MS);
}

main().catch(err => {
  process.stdout.write(ANSI.showCursor + ANSI.clearScreen + ANSI.cursorHome);
  console.error(err);
  process.exit(1);
});
