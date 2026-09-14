// Cohort Consultation Group — Live Calendar
// Cloudflare Worker + KV. Viewing and signing up are open to anyone with the link;
// adding/editing/removing sessions is PIN-gated.

const MANAGE_PIN = "2026"; // gates adding/editing/deleting sessions — shared with PAGE_PIN so any cohort member can manage their own week
const PAGE_PIN = "2026"; // gates viewing the page at all — change then redeploy anytime

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

    // --- API: create or update a session (admin, PIN required) ---
    if (pathname === "/api/sessions" && request.method === "POST") {
      const body = await request.json();
      if (body.pin !== MANAGE_PIN) {
        return new Response(JSON.stringify({ error: "Invalid PIN" }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const sessions = await getSessions(env);
      const existing = sessions.find((s) => s.id === body.id);
      const entry = {
        id: body.id || uid(),
        date: body.date || "",
        time: body.time || "6:30 PM",
        zoomLink: body.zoomLink || "",
        topic: body.topic || "",
        host: body.host || "",
        status: body.status || "Confirmed",
        attendees: existing ? existing.attendees || [] : [],
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

    // --- API: public RSVP sign-up (no PIN) ---
    const rsvpMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/rsvp$/);
    if (rsvpMatch && request.method === "POST") {
      const id = rsvpMatch[1];
      const body = await request.json().catch(() => ({}));
      const name = (body.name || "").trim();
      if (!name) {
        return new Response(JSON.stringify({ error: "Name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      const sessions = await getSessions(env);
      const session = sessions.find((s) => s.id === id);
      if (!session) {
        return new Response(JSON.stringify({ error: "Session not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders() },
        });
      }
      session.attendees = session.attendees || [];
      session.attendees.push({
        id: uid(),
        name,
        note: (body.note || "").trim(),
      });
      await saveSessions(env, sessions);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json", ...corsHeaders() },
      });
    }

    // --- API: delete a session (admin, PIN required) ---
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

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 780 200" preserveAspectRatio="xMidYMid slice">
  <defs>
    <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#e3bc63"/>
      <stop offset="100%" stop-color="#c9a84c"/>
    </radialGradient>
  </defs>
  <g stroke="#c9a84c" stroke-width="2" opacity="0.28">
    <line x1="390" y1="90" x2="390" y2="10"/>
    <line x1="390" y1="90" x2="330" y2="20"/>
    <line x1="390" y1="90" x2="450" y2="20"/>
    <line x1="390" y1="90" x2="290" y2="45"/>
    <line x1="390" y1="90" x2="490" y2="45"/>
    <line x1="390" y1="90" x2="270" y2="90"/>
    <line x1="390" y1="90" x2="510" y2="90"/>
  </g>
  <circle cx="390" cy="90" r="46" fill="url(#sunGlow)"/>
  <circle cx="390" cy="90" r="52" fill="none" stroke="#c9a84c" stroke-width="1.5" opacity="0.4"/>
  <path d="M0,150 C100,112 200,132 300,102 C400,72 500,112 600,92 C680,77 740,97 780,88 L780,200 L0,200 Z" fill="#a9bcae" opacity="0.55"/>
  <path d="M0,172 C80,142 160,162 260,138 C360,112 460,152 560,128 C640,108 720,138 780,124 L780,200 L0,200 Z" fill="#6f8c7c" opacity="0.75"/>
  <path d="M0,200 C90,166 180,186 280,162 C380,138 480,176 580,158 C660,144 730,166 780,154 L780,200 L0,200 Z" fill="#2d4a3e"/>
  <g fill="#6f8c7c" opacity="0.8" transform="translate(56,118) scale(0.55)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="14" fill="#5a7768"/>
  </g>
  <g fill="#6f8c7c" opacity="0.8" transform="translate(92,128) scale(0.4)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="14" fill="#5a7768"/>
  </g>
  <g fill="#233d33" transform="translate(600,88) scale(0.85)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="16" fill="#1b3129"/>
  </g>
  <g fill="#233d33" transform="translate(645,102) scale(1.05)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="18" fill="#1b3129"/>
  </g>
  <g fill="#2d4a3e" transform="translate(700,95) scale(0.9)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="16" fill="#1b3129"/>
  </g>
  <g fill="#233d33" transform="translate(742,108) scale(0.7)">
    <polygon points="20,0 0,35 40,35"/><polygon points="20,15 -4,55 44,55"/><polygon points="20,32 -8,80 48,80"/>
    <rect x="14" y="80" width="12" height="16" fill="#1b3129"/>
  </g>
  <g fill="#c9a84c" opacity="0.85">
    <circle cx="130" cy="182" r="3.5"/><circle cx="142" cy="188" r="3"/><circle cx="120" cy="190" r="2.5"/>
    <line x1="130" y1="182" x2="128" y2="196" stroke="#6f8c7c" stroke-width="1.5"/>
    <line x1="142" y1="188" x2="141" y2="198" stroke="#6f8c7c" stroke-width="1.5"/>
  </g>
</svg>`;

const PAGE_HTML = `<!DOCTYPE html>
<html lang="en" translate="no">
<head>
<meta charset="UTF-8">
<meta name="google" content="notranslate">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Cohort Consultation Group — Live Calendar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;500;600&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="https://unpkg.com/[email protected]/dist/xlsx.full.min.js"></script>
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
    padding: 0 24px 96px;
  }
  .page-toolbar {
    display: flex;
    justify-content: flex-end;
    gap: 16px;
    padding: 14px 0 2px;
  }
  .page-toolbar button {
    background: none;
    border: none;
    padding: 0;
    color: rgba(45,74,62,0.55);
    font-family: 'Jost', sans-serif;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
    white-space: nowrap;
  }
  .page-toolbar button:hover { color: var(--green); }

  .logo-banner {
    width: 100%;
    height: 150px;
    overflow: hidden;
    margin-bottom: 28px;
  }
  .logo-banner svg { width: 100%; height: 100%; display: block; }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    flex-wrap: wrap;
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
    font-size: 44px;
    margin: 0 0 8px;
    letter-spacing: 0.01em;
  }
  .lede {
    max-width: 560px;
    color: rgba(45,74,62,0.85);
    margin-bottom: 8px;
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
  }
  .card-top {
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
  .past .card { opacity: 0.55; }

  .host-tag {
    display: inline-block;
    margin-top: 12px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--gold);
    font-weight: 500;
  }
  .attendees {
    margin-top: 10px;
    font-size: 13px;
    color: rgba(45,74,62,0.85);
  }
  .attendees.empty { color: rgba(45,74,62,0.5); font-style: italic; }
  .attendees-label { font-weight: 500; color: var(--green); }
  .attendees .note { color: rgba(45,74,62,0.6); font-style: italic; }

  .rsvp-form { margin-top: 14px; border-top: 1px dashed var(--border); padding-top: 12px; }
  .rsvp-toggle {
    background: none; border: none; color: var(--green);
    font-family: 'Jost', sans-serif; font-size: 12px;
    letter-spacing: 0.06em; text-transform: uppercase;
    cursor: pointer; padding: 0; text-decoration: underline;
    text-underline-offset: 3px;
  }
  .rsvp-fields {
    display: none;
    gap: 8px;
    margin-top: 10px;
    flex-wrap: wrap;
  }
  .rsvp-fields.open { display: flex; }
  .rsvp-fields input {
    flex: 1;
    min-width: 140px;
    padding: 8px 10px;
    border: 1px solid var(--border);
    background: white;
    font-family: 'Jost', sans-serif;
    font-size: 13px;
    color: var(--green);
  }
  .rsvp-fields button {
    background: var(--green);
    color: var(--cream);
    border: none;
    padding: 8px 16px;
    font-family: 'Jost', sans-serif;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

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
  .pin-gate { margin-bottom: 16px; }

  .page-gate-overlay {
    position: fixed;
    inset: 0;
    background: var(--cream);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .page-gate-box {
    text-align: center;
    max-width: 320px;
    padding: 0 24px;
  }
  .page-gate-box .eyebrow { margin-bottom: 6px; }
  .page-gate-box h2 {
    font-family: 'Cormorant Garamond', serif;
    font-weight: 500;
    font-size: 28px;
    margin: 0 0 20px;
  }
  .page-gate-box input {
    width: 100%;
    text-align: center;
    letter-spacing: 0.3em;
    font-size: 20px;
    padding: 12px;
    border: 1px solid var(--border);
    background: white;
    color: var(--green);
    font-family: 'Jost', sans-serif;
    margin-bottom: 14px;
  }
  .page-gate-box button {
    width: 100%;
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
  .page-gate-error {
    color: #b04a3a;
    font-size: 12px;
    margin-top: 10px;
    display: none;
  }
  body.locked .wrap { display: none; }

  @media print {
    .page-toolbar, .manage-toggle, .manage-panel, .rsvp-form { display: none !important; }
    .logo-banner { height: 100px; }
  }

  @media (max-width: 720px) {
    h1 { font-size: 34px; }
    .header-row { flex-direction: column; }
  }
</style>
</head>
<body class="locked">
  <div class="page-gate-overlay" id="pageGate">
    <div class="page-gate-box">
      <div class="eyebrow">PAU &middot; 22C</div>
      <h2>Cohort Consultation Group</h2>
      <input type="text" id="pageGateInput" inputmode="numeric" autocomplete="off" placeholder="Enter PIN" maxlength="8" autofocus>
      <button onclick="checkPageGate()">Enter</button>
      <div class="page-gate-error" id="pageGateError">Incorrect PIN — try again.</div>
    </div>
  </div>

  <div class="wrap">
    <div class="page-toolbar">
      <button onclick="window.print()">Print</button>
      <button onclick="downloadCSV()">CSV</button>
      <button onclick="downloadXLSX()">Excel</button>
    </div>

    <div class="logo-banner">${LOGO_SVG}</div>

    <div class="header-row">
      <div>
        <div class="eyebrow">PAU &middot; 22C &middot; Graduated &amp; Current Students</div>
        <h1>Cohort Consultation Group</h1>
        <div class="lede">A running schedule of monthly consultation sessions — Sundays, 6:30 PM, over Zoom. Sign up below so your host knows to expect you.</div>
      </div>
    </div>

    <div class="section-label">Upcoming Sessions</div>
    <div id="upcoming"></div>

    <div class="section-label">Past Sessions</div>
    <div id="past" class="past"></div>

    <button class="manage-toggle" onclick="toggleManage()">+ Manage Sessions</button>
    <div class="manage-panel" id="managePanel">
      <div class="pin-gate" id="pinGate">
        <label>PIN</label>
        <input type="text" id="pinInput" inputmode="numeric" autocomplete="off" placeholder="Enter PIN to manage sessions">
        <button class="submit" onclick="checkPin()">Unlock</button>
      </div>
      <div id="formArea" style="display:none;">
        <input type="hidden" id="editId">
        <label>Date</label>
        <input type="date" id="fDate">
        <label>Time</label>
        <input type="text" id="fTime" value="6:30 PM">
        <label>Monthly Host</label>
        <input type="text" id="fHost" placeholder="Who's hosting this session?">
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
const PAGE_PIN = "${PAGE_PIN}";
let PIN = null;
let ALL_SESSIONS = [];

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

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
    ? upcoming.map(s => renderCard(s, true)).join('')
    : '<div class="empty-note">No sessions scheduled yet — check back soon.</div>';

  document.getElementById('past').innerHTML = past.length
    ? past.map(s => renderCard(s, false)).join('')
    : '<div class="empty-note">No past sessions yet.</div>';

  if (document.getElementById('formArea').style.display !== 'none') {
    renderExistingList();
  }
}

function renderCard(s, isUpcoming) {
  const attendees = s.attendees || [];
  const attendeesHtml = attendees.length
    ? '<div class="attendees"><span class="attendees-label">Attending (' + attendees.length + '):</span> ' +
      attendees.map(a => esc(a.name) + (a.note ? ' <span class="note">— ' + esc(a.note) + '</span>' : '')).join(', ') +
      '</div>'
    : '<div class="attendees empty">No one signed up yet</div>';

  const hostHtml = s.host ? '<div class="host-tag">Hosting: ' + esc(s.host) + '</div>' : '';

  const rsvpHtml = isUpcoming && s.status !== 'Cancelled' ? \`
    <div class="rsvp-form">
      <button class="rsvp-toggle" onclick="toggleRsvp('\${s.id}')">+ Sign up</button>
      <div class="rsvp-fields" id="rsvp-fields-\${s.id}">
        <input type="text" id="rsvp-name-\${s.id}" placeholder="Your name">
        <input type="text" id="rsvp-note-\${s.id}" placeholder="Note (optional)">
        <button onclick="submitRsvp('\${s.id}')">Add me</button>
      </div>
    </div>\` : '';

  return \`<div class="card">
    <div class="card-top">
      <div>
        <div class="date-block">\${fmtDate(s.date)}</div>
        <div class="time">\${esc(s.time)}</div>
      </div>
      <div class="meta">
        \${s.topic ? '<div class="topic">' + esc(s.topic) + '</div>' : ''}
        \${s.zoomLink ? '<div class="zoom-link"><a href="' + esc(s.zoomLink) + '" target="_blank">Join Zoom</a></div>' : '<div class="zoom-link" style="color:rgba(45,74,62,0.5)">Zoom link TBA</div>'}
        \${hostHtml}
      </div>
      <div class="status-tag status-\${s.status}">\${s.status}</div>
    </div>
    \${attendeesHtml}
    \${rsvpHtml}
  </div>\`;
}

function toggleRsvp(id) {
  document.getElementById('rsvp-fields-' + id).classList.toggle('open');
}

async function submitRsvp(id) {
  const name = document.getElementById('rsvp-name-' + id).value.trim();
  const note = document.getElementById('rsvp-note-' + id).value.trim();
  if (!name) { alert('Please enter your name.'); return; }
  const res = await fetch('/api/sessions/' + id + '/rsvp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, note }),
  });
  if (!res.ok) { alert('Something went wrong — try again.'); return; }
  await loadSessions();
}

function toggleManage() {
  document.getElementById('managePanel').classList.toggle('open');
}

function checkPin() {
  const val = document.getElementById('pinInput').value;
  PIN = val;
  document.getElementById('pinGate').style.display = 'none';
  document.getElementById('formArea').style.display = 'block';
  renderExistingList();
}

function renderExistingList() {
  const el = document.getElementById('existingList');
  el.innerHTML = '<label>Existing Sessions</label>' + ALL_SESSIONS.map(s => \`
    <div class="existing-row">
      <span>\${esc(s.date)} — \${esc(s.time)} (\${esc(s.status)})</span>
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
  document.getElementById('fHost').value = s.host || '';
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
    host: document.getElementById('fHost').value,
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
  document.getElementById('fHost').value = '';
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

function downloadCSV() {
  const headers = ['Date','Time','Topic','Host','Status','ZoomLink','Attendees'];
  const rows = ALL_SESSIONS.map(s => [
    s.date, s.time, s.topic || '', s.host || '', s.status, s.zoomLink || '',
    (s.attendees || []).map(a => a.name + (a.note ? ' (' + a.note + ')' : '')).join('; ')
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
    .join('\\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'cohort-consultation-sessions.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function downloadXLSX() {
  const rows = ALL_SESSIONS.map(s => ({
    Date: s.date, Time: s.time, Topic: s.topic || '', Host: s.host || '',
    Status: s.status, ZoomLink: s.zoomLink || '',
    Attendees: (s.attendees || []).map(a => a.name + (a.note ? ' (' + a.note + ')' : '')).join('; ')
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sessions');
  XLSX.writeFile(wb, 'cohort-consultation-sessions.xlsx');
}

loadSessions();

function checkPageGate() {
  const val = document.getElementById('pageGateInput').value;
  if (val === PAGE_PIN) {
    sessionStorage.setItem('ccgUnlocked', 'yes');
    document.body.classList.remove('locked');
    document.getElementById('pageGate').style.display = 'none';
  } else {
    document.getElementById('pageGateError').style.display = 'block';
  }
}

document.getElementById('pageGateInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') checkPageGate();
});

if (sessionStorage.getItem('ccgUnlocked') === 'yes') {
  document.body.classList.remove('locked');
  document.getElementById('pageGate').style.display = 'none';
}

</script>
</body>
</html>`;
