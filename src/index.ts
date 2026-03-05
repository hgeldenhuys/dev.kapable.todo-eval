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
  console.error("[todo-eval] KAPABLE_API_KEY not set!");
  process.exit(1);
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
      const apiPath = path.replace("/api/todos", "/v1/todos");
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
    .container {
      width: 100%;
      max-width: 600px;
    }
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
    .subtitle {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    .status-bar {
      display: flex;
      gap: 1rem;
      margin-bottom: 1rem;
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    .status-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 4px;
      vertical-align: middle;
    }
    .status-dot.connected { background: var(--success); }
    .status-dot.disconnected { background: var(--danger); }
    .add-form {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
    }
    .add-form input {
      flex: 1;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 0.875rem;
      outline: none;
    }
    .add-form input:focus {
      border-color: var(--primary);
    }
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
    .todo-list {
      list-style: none;
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
      transition: opacity 0.2s;
    }
    .todo-item.completed {
      opacity: 0.5;
    }
    .todo-item.completed .todo-title {
      text-decoration: line-through;
    }
    .todo-checkbox {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      border: 2px solid var(--border);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .todo-checkbox.checked {
      background: var(--success);
      border-color: var(--success);
    }
    .todo-checkbox.checked::after {
      content: "\\2713";
      color: white;
      font-size: 12px;
    }
    .todo-title {
      flex: 1;
      font-size: 0.875rem;
    }
    .todo-priority {
      font-size: 0.7rem;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .priority-high { background: #7f1d1d; color: #fca5a5; }
    .priority-medium { background: #78350f; color: #fcd34d; }
    .priority-low { background: #14532d; color: #86efac; }
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
    .event-log .event-op { font-weight: 600; }
    .event-op.INSERT { color: var(--success); }
    .event-op.UPDATE { color: var(--primary); }
    .event-op.DELETE { color: var(--danger); }
    @media (max-width: 480px) {
      .add-form { flex-wrap: wrap; }
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
    </div>

    <form class="add-form" onsubmit="addTodo(event)">
      <input type="text" id="todo-input" placeholder="What needs to be done?" required />
      <select id="priority-select">
        <option value="high">High</option>
        <option value="medium" selected>Medium</option>
        <option value="low">Low</option>
      </select>
      <button type="submit">Add</button>
    </form>

    <ul class="todo-list" id="todo-list"></ul>

    <div class="stats" id="stats"></div>

    <div class="event-log" id="event-log">
      <div style="color: var(--text-muted);">Real-time event log:</div>
    </div>
  </div>

  <script>
    let todos = [];
    let eventCount = 0;

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
      const priority = document.getElementById('priority-select').value;
      const title = input.value.trim();
      if (!title) return;

      await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, priority, completed: false }),
      });
      input.value = '';
      // Don't re-fetch — SSE will handle the update
    }

    async function toggleTodo(id, completed) {
      await fetch('/api/todos/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !completed }),
      });
    }

    async function deleteTodo(id) {
      await fetch('/api/todos/' + id, { method: 'DELETE' });
    }

    // ─── Rendering ───────────────────────────────
    function render() {
      const list = document.getElementById('todo-list');
      if (todos.length === 0) {
        list.innerHTML = '<div class="empty-state">No todos yet. Add one above!</div>';
      } else {
        list.innerHTML = todos.map(t => \`
          <li class="todo-item \${t.completed ? 'completed' : ''}" data-id="\${t.id}">
            <div class="todo-checkbox \${t.completed ? 'checked' : ''}"
                 onclick="toggleTodo('\${t.id}', \${t.completed})"></div>
            <span class="todo-title">\${escapeHtml(t.title)}</span>
            <span class="todo-priority priority-\${t.priority}">\${t.priority}</span>
            <button class="todo-delete" onclick="deleteTodo('\${t.id}')">&times;</button>
          </li>
        \`).join('');
      }

      const completed = todos.filter(t => t.completed).length;
      const total = todos.length;
      document.getElementById('stats').innerHTML =
        \`<span>Total: \${total}</span>
         <span>Completed: \${completed}</span>
         <span>Remaining: \${total - completed}</span>\`;
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

      evtSource.onopen = () => {
        dot.className = 'status-dot connected';
        status.textContent = 'Connected';
      };

      evtSource.addEventListener('change', (e) => {
        const event = JSON.parse(e.data);
        if (event.table !== 'todos') return;

        eventCount++;
        document.getElementById('event-count').textContent = eventCount;
        logEvent(event);

        if (event.op === 'INSERT') {
          todos.unshift(event.data);
          render();
        } else if (event.op === 'UPDATE') {
          const idx = todos.findIndex(t => t.id === event.id);
          if (idx >= 0) {
            todos[idx] = event.data;
            render();
          }
        } else if (event.op === 'DELETE') {
          todos = todos.filter(t => t.id !== event.id);
          render();
        }
      });

      evtSource.onerror = () => {
        dot.className = 'status-dot disconnected';
        status.textContent = 'Disconnected (reconnecting...)';
      };
    }

    function logEvent(event) {
      const log = document.getElementById('event-log');
      const div = document.createElement('div');
      div.className = 'event';
      const time = new Date().toLocaleTimeString();
      div.innerHTML = \`<span class="event-op \${event.op}">\${event.op}</span> \${event.table} — \${event.data?.title || event.id} <span style="float:right">\${time}</span>\`;
      log.insertBefore(div, log.children[1]); // After the header
      if (log.children.length > 52) log.removeChild(log.lastChild);
    }

    // ─── Init ────────────────────────────────────
    fetchTodos();
    connectSSE();
  </script>
</body>
</html>`;
