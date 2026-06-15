const socket = io();

// ── AUDIO ────────────────────────────────────────────────────
let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playCallSound() {
  const ctx = getAudioCtx();

  const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();

  resume.then(() => {
    const notes    = [523, 659, 784, 1047];
    const duration = 0.25;
    const gap      = 0.22;

    notes.forEach((freq, i) => {
      const t    = ctx.currentTime + i * gap;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type            = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.start(t);
      osc.stop(t + duration + 0.05);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  });
}

// ── RELOJ ────────────────────────────────────────────────────
function updateClock() {
  document.getElementById('clock').textContent =
    new Date().toLocaleTimeString('es-AR', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
}
setInterval(updateClock, 1000);
updateClock();

// ── FLASH ────────────────────────────────────────────────────
function flash() {
  const el = document.getElementById('flashOverlay');
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 500);
}

// ── TIEMPO RELATIVO ──────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return `hace ${diff}s`;
  return `hace ${Math.floor(diff / 60)}min`;
}

// ── SOCKET: ESTADO ───────────────────────────────────────────
socket.on('state-update', (data) => {
  const td   = document.getElementById('ticketDisplay');
  const cd   = document.getElementById('counterDisplay');
  const idle = document.getElementById('idleMsg');
  const cn   = document.getElementById('counterName');

  if (data.currentTicket) {
    td.textContent = data.currentTicket.id;
    cn.textContent = data.currentTicket.counter;
    td.style.display = 'block';
    cd.style.display = 'block';
    idle.style.display = 'none';
  } else {
    td.textContent = '---';
    idle.style.display = 'block';
    cd.style.display = 'none';
  }

  const ql   = document.getElementById('queueList');
  const show = data.queue.slice(0, 3);
  ql.innerHTML = show.length === 0
    ? '<div class="queue-empty">Sin turnos en espera</div>'
    : show.map(t => `
        <div class="queue-item">
          <div class="qi-num">${t.id}</div>
          <div class="qi-info">
            <div>En espera</div>
            <div class="qi-wait">⏱ ${timeAgo(t.createdAt)}</div>
          </div>
        </div>`).join('');

  const today = new Date().toISOString().split('T')[0];
  document.getElementById('todayCount').textContent   = data.dailyStats[today] || 0;
  document.getElementById('queueCount').textContent   = data.queue.length;
  document.getElementById('historyCount').textContent = data.history ? data.history.length : 0;
  document.getElementById('waitingBadge').style.display =
    data.queue.length > 0 ? 'inline-block' : 'none';
});

// ── SOCKET: TURNO LLAMADO ────────────────────────────────────
socket.on('ticket-called', () => {
  playCallSound();
  flash();
  const td = document.getElementById('ticketDisplay');
  td.classList.remove('animate');
  void td.offsetWidth;
  td.classList.add('animate');
});
