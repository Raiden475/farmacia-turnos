const socket = io();
let myTicket = null;

// ── SACAR TURNO ─────────────────────────────────────────────
function takeTicket() {
  socket.emit('new-ticket', {});
}

// ── SOCKET: TICKET GENERADO (solo para este cliente) ────────
socket.on('ticket-generated', (ticket) => {
  myTicket = ticket;
  const now = new Date();

  document.getElementById('myTicketNum').textContent = ticket.id;
  document.getElementById('myDate').textContent = now.toLocaleDateString('es-AR');
  document.getElementById('myTime').textContent = now.toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit'
  });
  document.getElementById('ticketResult').style.display = 'block';
});

// ── SOCKET: ACTUALIZAR ESTADO ───────────────────────────────
socket.on('state-update', (data) => {
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('inQueue').textContent     = data.queue.length;
  document.getElementById('servedToday').textContent = data.dailyStats[today] || 0;

  // Turno siendo atendido ahora
  const ns = document.getElementById('nowServing');
  if (data.currentTicket) {
    ns.style.display = 'flex';
    document.getElementById('nowNum').textContent = data.currentTicket.id;
  } else {
    ns.style.display = 'none';
  }

  // Posición de mi turno en la cola
  if (myTicket) {
    const pos = data.queue.findIndex(t => t.id === myTicket.id);
    if (pos >= 0) {
      document.getElementById('myPos').textContent  = `${pos + 1} en fila`;
      document.getElementById('myWait').textContent = `~${(pos + 1) * 3} min`;
    } else {
      const wasCalled = data.history && data.history.some(t => t.id === myTicket.id);
      if (wasCalled) {
        document.getElementById('myPos').textContent  = '✅ Atendido';
        document.getElementById('myWait').textContent = '---';
      }
    }
  }
});

// ── SOCKET: TURNO LLAMADO ───────────────────────────────────
socket.on('ticket-called', (ticket) => {
  if (myTicket && ticket.id === myTicket.id) {
    // ¡Es el turno de este cliente! — reproducir melodía
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.4, ctx.currentTime + i * 0.15);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.25);
      o.start(ctx.currentTime + i * 0.15);
      o.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
    document.getElementById('myPos').textContent  = '🔔 ¡ES SU TURNO!';
    document.getElementById('myWait').textContent = ticket.counter;
  }
});
