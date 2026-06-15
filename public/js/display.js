const socket = io();

// ── RELOJ ──────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}
setInterval(updateClock, 1000);
updateClock();

// ── SONIDO (Web Audio API) ──────────────────────────────────
function playCallSound() {
  const ctx   = new (window.AudioContext || window.webkitAudioContext)();
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
    gain.gain.setValueAtTime(0.5, ctx.currentTime + i * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.3);
    osc.start(ctx.currentTime + i * 0.18);
    osc.stop(ctx.currentTime + i * 0.18 + 0.35);
  });
}

// ── FLASH OVERLAY ───────────────────────────────────────────
function flash() {
  const el = document.getElementById('flashOverlay');
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 500);
}

// ── TIEMPO RELATIVO ─────────────────────────────────────────
function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString)) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  return `hace ${Math.floor(diff / 60)}min`;
}

// ── SOCKET: ACTUALIZAR ESTADO ───────────────────────────────
socket.on('state-update', (data) => {
  const td   = document.getElementById('ticketDisplay');
  const cd   = document.getElementById('counterDisplay');
  const idle = document.getElementById('idleMsg');
  const cn   = document.getElementById('counterName');

  if (data.currentTicket) {
    td.textContent  = data.currentTicket.id;
    cn.textContent  = data.currentTicket.counter;
    td.style.display = 'block';
    cd.style.display = 'block';
    idle.style.display = 'none';
  } else {
    td.textContent = '---';
    cn.textContent = '...';
    idle.style.display = 'block';
  }

  // Cola (máx 3)
  const ql   = document.getElementById('queueList');
  const show = data.queue.slice(0, 3);
  if (show.length === 0) {
    ql.innerHTML = '<div class="queue-empty">Sin turnos en espera</div>';
  } else {
    ql.innerHTML = show.map(t => `
      <div class="queue-item">
        <div class="qi-num">${t.id}</div>
        <div class="qi-info">
          <div>Turno en espera</div>
          <div class="qi-wait">⏱ ${timeAgo(t.createdAt)}</div>
        </div>
      </div>
    `).join('');
  }

  // Stats footer
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('todayCount').textContent   = data.dailyStats[today] || 0;
  document.getElementById('queueCount').textContent   = data.queue.length;
  document.getElementById('historyCount').textContent = data.history ? data.history.length : 0;
  document.getElementById('waitingBadge').style.display =
    data.queue.length > 0 ? 'inline-block' : 'none';
});

// ── SOCKET: TURNO LLAMADO ───────────────────────────────────
socket.on('ticket-called', () => {
  playCallSound();
  flash();
  const td = document.getElementById('ticketDisplay');
  td.classList.remove('animate');
  void td.offsetWidth; // forzar reflow para reiniciar animación
  td.classList.add('animate');
});
