// Cohort Consultation Group — Live Calendar
// Cloudflare Worker + KV, no login required to view; PIN-gated to manage entries.

const MANAGE_PIN = "2022"; // change this, then redeploy, whenever you like

const KV_KEY = "sessions";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function getSessions(env) {
  const raw = await env.SESSIONS_KV.get(KV_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveSessions(env, sessions) {
  await env.SESSIONS_KV.put(KV_KEY, JSON.stringify(sessions));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // --- API: list sessions ---
    if (pathname === "/api/sessions" && request.method === "GET") {
      const sessions = await getSessions(env);
      sessions.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return new Response(JSON.stringify(sessions), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // --- API: create or update a session ---
    if (pathname === "/api/sessions" && request.method === "POST") {
      const body = await request.json();
      if (body.pin !== MANAGE_PIN) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const sessions = await getSessions(env);
      const entry = {
        id: body.id || uid(),
        date: body.date || "",
        time: body.time || "6:30 PM",
        zoomLink: body.zoomLink || "",
        topic: body.topic || "",
        status: body.status || "Confirmed",
      };
      const idx = sessions.findIndex((s) => s.id === entry.id);
      if (idx >= 0) {
        sessions[idx] = entry;
      } else {
        sessions.push(entry);
      }
      await saveSessions(env, sessions);
      return new Response(JSON.stringify({ ok: true, entry }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // --- API: delete a session ---
    if (pathname.startsWith("/api/sessions/") && request.method === "DELETE") {
      const id = pathname.split("/").pop();
      const body = await request.json().catch(() => ({}));
      if (body.pin !== MANAGE_PIN) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      let sessions = await getSessions(env);
      sessions = sessions.filter((s) => s.id !== id);
      await saveSessions(env, sessions);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // --- Page ---
    if (pathname === "/" || pathname === "") {
      return new Response(PAGE_HTML, {
        headers: { "Content-Type": "text/html; charset=UTF-8" },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cohort Consultation Group — Live Calendar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;500;600&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  :root {
    --green: #2d4a3e;
    --gold: #c9a84c;
    --cream: #faf7f2;
    --border: rgba(45,74,62,0.15);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--cream);
    color: var(--green);
    font-family: 'Jost', sans-serif;
    font-weight: 300;
    line-height: 1.6;
  }
  .wrap {
    max-width: 780px;
    margin: 0 auto;
    padding: 64px 24px 96px;
  }
  .eyebrow {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--gold);
    font-weight: 500;
    margin-bottom: 10px;
  }
  h1 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 500;
    font-size: 42px;
    margin: 0 0 8px;
    letter-spacing: 0.01em;
  }
  .lede {
    max-width: 560px;
    color: rgba(45,74,62,0.85);
    margin-bottom: 40px;
    font-size: 15px;
  }
  .section-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: var(--gold);
    font-weight: 500;
    margin: 40px 0 16px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
  }
  .card {
    border: 1px solid var(--border);
    padding: 22px 24px;
    margin-bottom: 14px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
  }
  .card .date-block {
    font-family: 'Cormorant Garamond', serif;
    font-size: 26px;
    font-weight: 600;
    min-width: 140px;
  }
  .card .time {
    font-size: 13px;
    color: rgba(45,74,62,0.7);
    margin-top: 2px;
  }
  .card .meta {
    flex: 1;
    min-width: 200px;
  }
  .card .topic {
    font-size: 15px;
    margin-bottom: 6px;
  }
  .card .zoom-link a {
    color: var(--green);
    font-size: 13px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .status-tag {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.14em;
    padding: 4px 10px;
    border: 1px solid var(--border);
    align-self: flex-start;
  }
  .status-Confirmed { color: var(--green); }
  .status-Cancelled { color: #b04a3a; border-color: rgba(176,74,58,0.3); text-decoration: line-through; }
  .empty-note {
    font-size: 14px;
    color: rgba(45,74,62,0.6);
    font-style: italic;
    padding: 20px 0;
  }
  .past .card { opacity: 0.5; }

  .manage-toggle {
    margin-top: 56px;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(45,74,62,0.5);
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    font-family: 'Jost', sans-serif;
  }
  .manage-panel {
    display: none;
    margin-top: 20px;
    border: 1px solid var(--border);
    padding: 24px;
  }
  .manage-panel.open { display: block; }
  .manage-panel input, .manage-panel select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border);
    background: white;
    font-family: 'Jost', sans-serif;
    font-size: 14px;
    color: var(--green);
    margin-bottom: 12px;
  }
  .manage-panel label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(45,74,62,0.7);
    display: block;
    margin-bottom: 4px;
  }
  .manage-panel button.submit {
    background: var(--green);
    color: var(--cream);
    border: none;
    padding: 12px 20px;
    font-family: 'Jost', sans-serif;
    font-size: 13px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .existing-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border);
    padding: 10px 0;
    font-size: 13px;
  }
  .existing-row button {
    background: none;
    border: 1px solid var(--border);
    color: var(--green);
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    margin-left: 8px;
  }
  .pin-gate {
    margin-bottom: 16px;
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">PAU &middot; 22C &middot; Graduated &amp; Current Students</div>
    <h1>Cohort Consultation Group</h1>
    <div class="lede">A running schedule of monthly consultation sessions — Sundays, 6:30 PM, over Zoom. Dates are added here as they're set.</div>

    <div class="section-label">Upcoming Sessions</div>
    <div id="upcoming"></div>

    <div class="section-label">Past Sessions</div>
    <div id="past" class="past"></div>

    <button class="manage-toggle" onclick="toggleManage()">+ Manage Sessions</button>
    <div class="manage-panel" id="managePanel">
      <div class="pin-gate" id="pinGate">
        <label>PIN</label>
        <input type="password" id="pinInput" placeholder="Enter PIN to manage sessions">
        <button class="submit" onclick="checkPin()">Unlock</button>
      </div>
      <div id="formArea" style="display:none;">
        <input type="hidden" id="editId">
        <label>Date</label>
        <input type="date" id="fDate">
        <label>Time</label>
        <input type="text" id="fTime" value="6:30 PM">
        <label>Zoom Link</label>
        <input type="text" id="fZoom" placeholder="https://zoom.us/j/...">
        <label>Topic / Notes (optional)</label>
        <input type="text" id="fTopic" placeholder="e.g. Open roundtable">
        <label>Status</label>
        <select id="fStatus">
          <option value="Confirmed">Confirmed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        <button class="submit" onclick="submitSession()">Save Session</button>
        <div id="existingList" style="margin-top:24px;"></div>
      </div>
    </div>
  </div>

<script>
let PIN = null;
let ALL_SESSIONS = [];

function fmtDate(d) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function loadSessions() {
  const res = await fetch('/api/sessions');
  ALL_SESSIONS = await res.json();
  render();
}

function render() {
  const today = new Date().toISOString().slice(0,10);
  const upcoming = ALL_SESSIONS.filter(s => s.date >= today);
  const past = ALL_SESSIONS.filter(s => s.date < today).reverse();

  document.getElementById('upcoming').innerHTML = upcoming.length
    ? upcoming.map(renderCard).join('')
    : '<div class="empty-note">No sessions scheduled yet — check back soon.</div>';

  document.getElementById('past').innerHTML = past.length
    ? past.map(renderCard).join('')
    : '<div class="empty-note">No past sessions yet.</div>';

  if (document.getElementById('formArea').style.display !== 'none') {
    renderExistingList();
  }
}

function renderCard(s) {
  return \`<div class="card">
    <div>
      <div class="date-block">\${fmtDate(s.date)}</div>
      <div class="time">\${s.time}</div>
    </div>
    <div class="meta">
      \${s.topic ? '<div class="topic">' + s.topic + '</div>' : ''}
      \${s.zoomLink ? '<div class="zoom-link"><a href="' + s.zoomLink + '" target="_blank">Join Zoom</a></div>' : '<div class="zoom-link" style="color:rgba(45,74,62,0.5)">Zoom link TBA</div>'}
    </div>
    <div class="status-tag status-\${s.status}">\${s.status}</div>
  </div>\`;
}

function toggleManage() {
  document.getElementById('managePanel').classList.toggle('open');
}

function checkPin() {
  const val = document.getElementById('pinInput').value;
  // Real validation happens server-side on save; this just gates the UI.
  PIN = val;
  document.getElementById('pinGate').style.display = 'none';
  document.getElementById('formArea').style.display = 'block';
  renderExistingList();
}

function renderExistingList() {
  const el = document.getElementById('existingList');
  el.innerHTML = '<label>Existing Sessions</label>' + ALL_SESSIONS.map(s => \`
    <div class="existing-row">
      <span>\${s.date} — \${s.time} (\${s.status})</span>
      <span>
        <button onclick='editSession(\${JSON.stringify(JSON.stringify(s))})'>Edit</button>
        <button onclick="deleteSession('\${s.id}')">Delete</button>
      </span>
    </div>\`).join('');
}

function editSession(jsonStr) {
  const s = JSON.parse(jsonStr);
  document.getElementById('editId').value = s.id;
  document.getElementById('fDate').value = s.date;
  document.getElementById('fTime').value = s.time;
  document.getElementById('fZoom').value = s.zoomLink;
  document.getElementById('fTopic').value = s.topic;
  document.getElementById('fStatus').value = s.status;
}

async function submitSession() {
  const payload = {
    pin: PIN,
    id: document.getElementById('editId').value || undefined,
    date: document.getElementById('fDate').value,
    time: document.getElementById('fTime').value,
    zoomLink: document.getElementById('fZoom').value,
    topic: document.getElementById('fTopic').value,
    status: document.getElementById('fStatus').value,
  };
  const res = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.status === 401) {
    alert('Incorrect PIN.');
    return;
  }
  document.getElementById('editId').value = '';
  document.getElementById('fDate').value = '';
  document.getElementById('fZoom').value = '';
  document.getElementById('fTopic').value = '';
  document.getElementById('fStatus').value = 'Confirmed';
  await loadSessions();
}

async function deleteSession(id) {
  if (!confirm('Delete this session?')) return;
  const res = await fetch('/api/sessions/' + id, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: PIN }),
  });
  if (res.status === 401) {
    alert('Incorrect PIN.');
    return;
  }
  await loadSessions();
}

loadSessions();
</script>
</body>
</html>`;

