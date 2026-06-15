const socket = io();

// ── HELPERS ────────────────────────────────────────────────
function getCounter() {
  return document.getElementById('counterSelect').value;
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}min`;
}

function formatDate(d) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function showToast(msg, isError = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'show' + (isError ? ' error' : '');
  setTimeout(() => t.className = '', 3000);
}

// ── ACCIONES ───────────────────────────────────────────────
function callNext() {
  socket.emit('call-next', { counter: getCounter() });
}

function callSpecific(ticketId) {
  socket.emit('call-specific', { ticketId, counter: getCounter() });
}

// ── SOCKET: ESTADO ─────────────────────────────────────────
socket.on('state-update', (data) => {
  // Turno actual
  const ct = data.currentTicket;
  document.getElementById('currentTicket').textContent  = ct ? ct.id      : '---';
  document.getElementById('currentCounter').textContent = ct ? ct.counter : 'Sin turno activo';

  // Cola
  document.getElementById('queueSize').textContent = data.queue.length;
  const ql = document.getElementById('queueList');
  if (data.queue.length === 0) {
    ql.innerHTML = '<div style="color:#546e7a;text-align:center;padding:20px">Sin turnos en espera</div>';
  } else {
    ql.innerHTML = data.queue.map(t => `
      <div class="qi-row">
        <span class="ticket-id">${t.id}</span>
        <span style="color:#546e7a;font-size:0.8rem">${timeAgo(t.createdAt)}</span>
        <button class="call-btn" onclick="callSpecific('${t.id}')">Llamar</button>
      </div>
    `).join('');
  }

  // Stats por día
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('todayServed').textContent = data.dailyStats[today] || 0;

  const sl      = document.getElementById('statsList');
  const entries = Object.entries(data.dailyStats).sort((a, b) => b[0].localeCompare(a[0]));
  if (entries.length === 0) {
    sl.innerHTML = '<div style="color:#546e7a">Sin datos aún</div>';
  } else {
    sl.innerHTML = entries.map(([d, n]) => `
      <div class="stats-day-row">
        <span class="day">📅 ${formatDate(d)}</span>
        <span class="cnt">${n} turnos</span>
      </div>
    `).join('');
  }
});

socket.on('ticket-called', (ticket) => {
  showToast(`✅ Llamado: ${ticket.id} → ${ticket.counter}`);
});

socket.on('error-msg', (msg) => showToast(msg, true));
