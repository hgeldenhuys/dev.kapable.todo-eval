/**
 * Todo Eval — Kapable Platform Stress Test App
 *
 * A single-file Bun server that exercises:
 * - Dynamic Data API (CRUD)
 * - Real-time SSE
 * - Serverless Functions
 * - Auth (API key)
 */

const port = Number(process.env.PORT) || 3000;
const API_URL = process.env.KAPABLE_API_URL || "https://api.kapable.dev";
const API_KEY = process.env.KAPABLE_API_KEY || "";
const PROJECT_ID = process.env.KAPABLE_PROJECT_ID || "";

if (!API_KEY) {
  console.warn("[todo-eval] WARNING: KAPABLE_API_KEY not set — API calls will fail");
}

/** Proxy requests to the Kapable API */
async function proxyToApi(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${API_KEY}`,
    ...(init?.headers as Record<string, string> || {}),
  };
  if (init?.body) {
    headers["Content-Type"] = "application/json";
  }
  const resp = await fetch(url, { ...init, headers });
  return resp;
}

/** Serve the single-page app */
function serveHtml(): Response {
  return new Response(HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Health check
    if (path === "/health") {
      return Response.json({ status: "ok", app: "todo-eval" });
    }

    // Serve HTML for root
    if (path === "/" || path === "/index.html") {
      return serveHtml();
    }

    // SSE proxy — stream through to client
    if (path === "/api/sse") {
      const sseUrl = `${API_URL}/v1/sse?tables=todos&apiKey=${API_KEY}`;
      const upstream = await fetch(sseUrl);
      if (!upstream.ok || !upstream.body) {
        return new Response("SSE connection failed", { status: 502 });
      }
      return new Response(upstream.body, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // API proxy — /api/todos/* → /v1/todos/*
    if (path.startsWith("/api/todos")) {
      const apiPath = path.replace("/api/todos", "/v1/todos") + url.search;
      const body = req.method !== "GET" && req.method !== "DELETE"
        ? await req.text()
        : undefined;
      const resp = await proxyToApi(apiPath, {
        method: req.method,
        body,
      });
      const data = await resp.text();
      return new Response(data, {
        status: resp.status,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // Function invoke proxy
    if (path === "/api/function/count-incomplete") {
      const resp = await proxyToApi("/v1/todos?filter=completed.eq.false", {
        method: "GET",
      });
      const data = await resp.json() as { data: unknown[]; pagination: { total: number } };
      return Response.json({
        incomplete_count: data.pagination?.total ?? 0,
        total: data.data?.length ?? 0,
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`[todo-eval] Server running on http://0.0.0.0:${port}`);

// ─── HTML Template ───────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Todo Eval — Kapable Platform Stress Test</title>
  <style>
    :root {
      --bg: #0f172a;
      --surface: #1e293b;
      --border: #334155;
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --success: #22c55e;
      --danger: #ef4444;
      --danger-hover: #dc2626;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .container { width: 100%; max-width: 600px; }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
    .subtitle { color: var(--text-muted); font-size: 0.875rem; margin-bottom: 1.5rem; }

    /* Status bar */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 0.75rem;
      font-size: 0.75rem;
      color: var(--text-muted);
      flex-wrap: wrap;
    }
    .status-dot {
      display: inline-block;
      width: 8px; height: 8px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }
    .status-dot.connected { background: var(--success); }
    .status-dot.disconnected { background: var(--danger); }
    .count-btn {
      margin-left: auto;
      padding: 4px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .count-btn:hover { border-color: var(--primary); color: var(--text); }
    .count-btn:disabled { opacity: 0.6; cursor: default; }
    .count-result { font-size: 0.75rem; color: var(--primary); }

    /* Progress bar */
    .progress-wrap {
      height: 4px;
      background: var(--border);
      border-radius: 2px;
      margin-bottom: 1.5rem;
      overflow: hidden;
    }
    .progress-bar {
      height: 100%;
      background: var(--success);
      border-radius: 2px;
      transition: width 0.4s ease;
      width: 0%;
    }

    /* Add form */
    .add-form {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 1rem;
    }
    .add-form input {
      flex: 1;
      min-width: 120px;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.875rem;
      outline: none;
    }
    .add-form input:focus { border-color: var(--primary); }
    .add-form select {
      padding: 0.75rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.875rem;
      outline: none;
    }
    .add-form button {
      padding: 0.75rem 1.5rem;
      background: var(--primary);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      cursor: pointer;
      white-space: nowrap;
    }
    .add-form button:hover { background: var(--primary-hover); }

    /* Filter bar */
    .filter-bar {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1rem;
      flex-wrap: wrap;
    }
    .filter-group { display: flex; gap: 4px; }
    .filter-btn {
      padding: 4px 10px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text-muted);
      font-size: 0.75rem;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
    }
    .filter-btn.active {
      border-color: var(--primary);
      color: var(--text);
      background: #1e3a5f;
    }

    /* Todo list & animations */
    .todo-list { list-style: none; }

    @keyframes slideIn {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes slideOut {
      from { opacity: 1; transform: translateX(0);  max-height: 80px; margin-bottom: 0.5rem; }
      to   { opacity: 0; transform: translateX(20px); max-height: 0;   margin-bottom: 0; padding: 0; }
    }

    .todo-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 0.5rem;
      animation: slideIn 0.2s ease;
      overflow: hidden;
      transition: opacity 0.2s;
    }
    .todo-item.removing {
      animation: slideOut 0.25s ease forwards;
      pointer-events: none;
    }
    .todo-item.completed { opacity: 0.55; }
    .todo-item.completed .todo-title { text-decoration: line-through; }

    .todo-checkbox {
      width: 20px; height: 20px;
      border-radius: 50%;
      border: 2px solid var(--border);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s, border-color 0.15s;
    }
    .todo-checkbox.checked { background: var(--success); border-color: var(--success); }
    .todo-checkbox.checked::after { content: "\\2713"; color: white; font-size: 12px; }

    .todo-meta { flex: 1; min-width: 0; }
    .todo-title { font-size: 0.875rem; }
    .todo-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
    .tag {
      font-size: 0.65rem;
      padding: 1px 6px;
      border-radius: 10px;
      background: #1e3a5f;
      color: #93c5fd;
      border: 1px solid #2563eb44;
    }

    .todo-priority {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .priority-high   { background: #7f1d1d; color: #fca5a5; }
    .priority-medium { background: #78350f; color: #fcd34d; }
    .priority-low    { background: #14532d; color: #86efac; }

    .todo-delete {
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      font-size: 1rem;
      opacity: 0;
      transition: opacity 0.15s;
    }
    .todo-item:hover .todo-delete { opacity: 1; }
    .todo-delete:hover { color: var(--danger); }

    .empty-state {
      text-align: center;
      color: var(--text-muted);
      padding: 3rem;
      font-size: 0.875rem;
    }

    .stats {
      display: flex;
      gap: 1rem;
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border-radius: 8px;
      font-size: 0.75rem;
      color: var(--text-muted);
      flex-wrap: wrap;
    }

    .event-log {
      margin-top: 1.5rem;
      padding: 1rem;
      background: var(--surface);
      border-radius: 8px;
      max-height: 200px;
      overflow-y: auto;
      font-family: monospace;
      font-size: 0.7rem;
      color: var(--text-muted);
    }
    .event-log .event {
      margin-bottom: 4px;
      padding: 2px 0;
      border-bottom: 1px solid var(--border);
    }
    .event-op { font-weight: 600; }
    .event-op.INSERT { color: var(--success); }
    .event-op.UPDATE { color: var(--primary); }
    .event-op.DELETE { color: var(--danger); }

    @media (max-width: 480px) {
      .add-form input { width: 100%; }
      .add-form select, .add-form button { flex: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Todo Eval</h1>
    <p class="subtitle">Kapable Platform Stress Test</p>

    <div class="status-bar">
      <span><span class="status-dot disconnected" id="sse-dot"></span> SSE: <span id="sse-status">Connecting...</span></span>
      <span>Events: <span id="event-count">0</span></span>
      <button class="count-btn" onclick="countIncomplete()">Count Incomplete</button>
      <span class="count-result" id="count-result"></span>
    </div>

    <div class="progress-wrap">
      <div class="progress-bar" id="progress-bar"></div>
    </div>

    <form class="add-form" onsubmit="addTodo(event)">
      <input type="text" id="todo-input" placeholder="What needs to be done?" required />
      <input type="text" id="tags-input" placeholder="Tags (comma-separated)" />
      <select id="priority-select">
        <option value="high">High</option>
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
      </select>
      <button type="submit">Add</button>
    </form>

    <div class="filter-bar">
      <div class="filter-group">
        <button class="filter-btn active" onclick="setFilter('priority','all',this)">All</button>
        <button class="filter-btn" onclick="setFilter('priority','high',this)">High</button>
        <button class="filter-btn" onclick="setFilter('priority','medium',this)">Med</button>
        <button class="filter-btn" onclick="setFilter('priority','low',this)">Low</button>
      </div>
      <div class="filter-group">
        <button class="filter-btn active" onclick="setFilter('status','all',this)">All</button>
        <button class="filter-btn" onclick="setFilter('status','active',this)">Active</button>
        <button class="filter-btn" onclick="setFilter('status','completed',this)">Completed</button>
      </div>
    </div>

    <ul class="todo-list" id="todo-list"></ul>

    <div class="stats" id="stats"></div>

    <div class="event-log" id="event-log">
      <div style="color: var(--text-muted);">Real-time event log:</div>
    </div>
  </div>

  <script>
    let todos = [];
    let eventCount = 0;
    let filterPriority = 'all';
    let filterStatus = 'all';

    function getFiltered() {
      return todos.filter(function(t) {
        if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
        if (filterStatus === 'active' && t.completed) return false;
        if (filterStatus === 'completed' && !t.completed) return false;
        return true;
      });
    }

    function setFilter(type, value, btn) {
      if (type === 'priority') filterPriority = value;
      else filterStatus = value;
      var group = btn.closest('.filter-group');
      group.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      render();
    }

    // ─── API calls ───────────────────────────────
    async function fetchTodos() {
      const resp = await fetch('/api/todos?order_by=created_at&order=desc');
      const data = await resp.json();
      todos = data.data || [];
      render();
    }

    async function addTodo(e) {
      e.preventDefault();
      const input = document.getElementById('todo-input');
      const tagsInput = document.getElementById('tags-input');
      const priority = document.getElementById('priority-select').value;
      const title = input.value.trim();
      if (!title) return;
      const rawTags = tagsInput.value.trim();
      const tags = rawTags
        ? rawTags.split(',').map(function(s) { return s.trim(); }).filter(Boolean)
        : [];
      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, completed: false, tags }),
      });
      input.value = '';
      tagsInput.value = '';
      // SSE will handle the update
    }

    async function toggleTodo(id, completed) {
      await fetch('/api/todos/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
    }

    async function deleteTodo(id) {
      const item = document.querySelector('[data-id="' + id + '"]');
      if (item) {
        item.classList.add('removing');
        await new Promise(function(r) { setTimeout(r, 250); });
      }
      await fetch('/api/todos/' + id, { method: 'DELETE' });
    }

    async function countIncomplete() {
      const btn = document.querySelector('.count-btn');
      const result = document.getElementById('count-result');
      btn.textContent = 'Counting...';
      btn.disabled = true;
      try {
        const resp = await fetch('/api/function/count-incomplete');
        const data = await resp.json();
        result.textContent = data.incomplete_count + ' incomplete';
      } catch(err) {
        result.textContent = 'Error';
      } finally {
        btn.textContent = 'Count Incomplete';
        btn.disabled = false;
      }
    }

    // ─── Rendering ───────────────────────────────
    function renderTags(tags) {
      if (!tags || !tags.length) return '';
      return '<div class="todo-tags">' +
        tags.map(function(tag) {
          return '<span class="tag">' + escapeHtml(String(tag)) + '</span>';
        }).join('') +
        '</div>';
    }

    function render() {
      const list = document.getElementById('todo-list');
      const filtered = getFiltered();
      if (filtered.length === 0) {
        list.innerHTML = '<div class="empty-state">No todos here. Add one above!</div>';
      } else {
        list.innerHTML = filtered.map(function(t) {
          return (
            '<li class="todo-item ' + (t.completed ? 'completed' : '') + '" data-id="' + t.id + '">' +
              '<div class="todo-checkbox ' + (t.completed ? 'checked' : '') + '"' +
                ' onclick="toggleTodo(\\'' + t.id + '\\',' + t.completed + ')"></div>' +
              '<div class="todo-meta">' +
                '<div class="todo-title">' + escapeHtml(t.title) + '</div>' +
                renderTags(t.tags) +
              '</div>' +
              '<span class="todo-priority priority-' + (t.priority || 'medium') + '">' + (t.priority || 'medium') + '</span>' +
              '<button class="todo-delete" onclick="deleteTodo(\\'' + t.id + '\\')">&times;</button>' +
            '</li>'
          );
        }).join('');
      }

      const completed = todos.filter(function(t) { return t.completed; }).length;
      const total = todos.length;
      const pct = total > 0 ? Math.round(completed / total * 100) : 0;
      document.getElementById('progress-bar').style.width = pct + '%';
      document.getElementById('stats').innerHTML =
        '<span>Total: ' + total + '</span>' +
        '<span>Completed: ' + completed + '</span>' +
        '<span>Remaining: ' + (total - completed) + '</span>' +
        '<span style="margin-left:auto">' + pct + '% done</span>';
    }

    function escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    }

    // ─── SSE Real-time ───────────────────────────
    function connectSSE() {
      const evtSource = new EventSource('/api/sse');
      const dot = document.getElementById('sse-dot');
      const status = document.getElementById('sse-status');

      evtSource.onopen = function() {
        dot.className = 'status-dot connected';
        status.textContent = 'Connected';
      };

      evtSource.addEventListener('change', function(e) {
        const event = JSON.parse(e.data);
        if (event.table !== 'todos') return;

        eventCount++;
        document.getElementById('event-count').textContent = eventCount;
        logEvent(event);

        if (event.op === 'INSERT') {
          todos.unshift(event.data);
          render();
        } else if (event.op === 'UPDATE') {
          const idx = todos.findIndex(function(t) { return t.id === event.id; });
          if (idx >= 0) { todos[idx] = event.data; render(); }
        } else if (event.op === 'DELETE') {
          todos = todos.filter(function(t) { return t.id !== event.id; });
          render();
        }
      });

      evtSource.onerror = function() {
        dot.className = 'status-dot disconnected';
        status.textContent = 'Disconnected (reconnecting...)';
      };
    }

    function logEvent(event) {
      const log = document.getElementById('event-log');
      const div = document.createElement('div');
      div.className = 'event';
      const time = new Date().toLocaleTimeString();
      const title = event.data && event.data.title ? escapeHtml(event.data.title) : event.id;
      div.innerHTML =
        '<span class="event-op ' + event.op + '">' + event.op + '</span> ' +
        event.table + ' \u2014 ' + title +
        ' <span style="float:right">' + time + '</span>';
      log.insertBefore(div, log.children[1]);
      if (log.children.length > 52) log.removeChild(log.lastChild);
    }

    // ─── Init ────────────────────────────────────
    fetchTodos();
    connectSSE();
  </script>
</body>
</html>`;
