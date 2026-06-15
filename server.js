const express  = require("express");
const http     = require("http");
const { Server } = require("socket.io");
const path     = require("path");

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────
//  ESTADO GLOBAL
// ─────────────────────────────────────────
let state = {
  counter:       0,
  queue:         [],
  currentTicket: null,
  history:       [],
  dailyStats:    {},
  chatMessages:  [],   // historial general (últimos 100)
};

// socketId → nombre de usuario
const connectedUsers = new Map();

// nombre → socketId  (para mensajes privados)
const userSockets = new Map();

const PREFIXES = ["A", "B", "C"];
function getTodayKey() { return new Date().toISOString().split("T")[0]; }
function padNumber(n)  { return String(n).padStart(3, "0"); }

function broadcastState() {
  io.emit("state-update", {
    queue:         state.queue,
    currentTicket: state.currentTicket,
    history:       state.history.slice(-3).reverse(),
    dailyStats:    state.dailyStats,
  });
}

function broadcastUsers() {
  const users = [...connectedUsers.values()];
  io.emit("users-update", users);
}

// ─────────────────────────────────────────
//  CONEXIÓN
// ─────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[+] Conectado: ${socket.id}`);

  socket.emit("state-update", {
    queue:         state.queue,
    currentTicket: state.currentTicket,
    history:       state.history.slice(-3).reverse(),
    dailyStats:    state.dailyStats,
  });
  socket.emit("chat-history", state.chatMessages);

  // ── TURNOS ────────────────────────────────
  socket.on("new-ticket", () => {
    const prefix = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
    state.counter++;
    const ticket = { id:`${prefix}${padNumber(state.counter)}`, prefix, createdAt:new Date().toISOString(), status:"waiting" };
    state.queue.push(ticket);
    broadcastState();
    socket.emit("ticket-generated", ticket);
  });

  socket.on("call-next", (data) => {
    if (state.queue.length === 0) { socket.emit("error-msg","No hay tickets."); return; }
    const ticket = state.queue.shift();
    ticket.calledAt = new Date().toISOString();
    ticket.counter  = data.counter || "Caja 1";
    ticket.status   = "called";
    state.currentTicket = ticket;
    state.history.push(ticket);
    state.dailyStats[getTodayKey()] = (state.dailyStats[getTodayKey()] || 0) + 1;
    io.emit("ticket-called", ticket);
    broadcastState();
  });

  socket.on("call-specific", (data) => {
    const idx = state.queue.findIndex(t => t.id === data.ticketId);
    if (idx === -1) { socket.emit("error-msg","Ticket no encontrado."); return; }
    const ticket = state.queue.splice(idx, 1)[0];
    ticket.calledAt = new Date().toISOString();
    ticket.counter  = data.counter || "Caja 1";
    ticket.status   = "called";
    state.currentTicket = ticket;
    state.history.push(ticket);
    state.dailyStats[getTodayKey()] = (state.dailyStats[getTodayKey()] || 0) + 1;
    io.emit("ticket-called", ticket);
    broadcastState();
  });

  // ── CHAT GENERAL ──────────────────────────
  socket.on("user-joined", (data) => {
    if (!data.user) return;
    connectedUsers.set(socket.id, data.user);
    userSockets.set(data.user, socket.id);
    console.log(`[CHAT] ${data.user} se unió`);
    socket.broadcast.emit("user-connected", { user: data.user });
    broadcastUsers();
  });

  socket.on("chat-message", (data) => {
    const msg = {
      id:    Date.now(),
      user:  data.user || "Anónimo",
      text:  data.text,
      time:  new Date().toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit" }),
    };
    state.chatMessages.push(msg);
    if (state.chatMessages.length > 100) state.chatMessages.shift();
    io.emit("chat-message", msg);
  });

  // ── MENSAJE PRIVADO ───────────────────────
  socket.on("private-message", (data) => {
    // data = { from, to, text }
    const msg = {
      from: data.from,
      to:   data.to,
      text: data.text,
      time: new Date().toLocaleTimeString("es-AR", { hour:"2-digit", minute:"2-digit" }),
    };

    // Enviar al destinatario
    const toSocketId = userSockets.get(data.to);
    if (toSocketId) {
      io.to(toSocketId).emit("private-message", msg);
    }

    // Confirmar al remitente (para que aparezca en su propia ventana)
    socket.emit("private-message", msg);

    console.log(`[PRIVADO] ${data.from} → ${data.to}: ${data.text.substring(0,40)}`);
  });

  // ── TYPING GENERAL ────────────────────────
  socket.on("typing-start", (data) => {
    socket.broadcast.emit("typing-start", { user: data.user });
  });
  socket.on("typing-stop", (data) => {
    socket.broadcast.emit("typing-stop", { user: data.user });
  });

  // ── TYPING PRIVADO ────────────────────────
  socket.on("private-typing-start", (data) => {
    const toSocketId = userSockets.get(data.to);
    if (toSocketId) io.to(toSocketId).emit("private-typing-start", { from: data.from });
  });
  socket.on("private-typing-stop", (data) => {
    const toSocketId = userSockets.get(data.to);
    if (toSocketId) io.to(toSocketId).emit("private-typing-stop", { from: data.from });
  });

  // ── DESCONEXIÓN ───────────────────────────
  socket.on("disconnect", () => {
    const user = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    if (user) {
      userSockets.delete(user);
      io.emit("user-disconnected", { user });
      io.emit("typing-stop", { user });
      broadcastUsers();
      console.log(`[-] ${user} desconectado`);
    }
  });
});

// ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n✅  Servidor en http://localhost:${PORT}`);
  console.log(`   Chat → http://localhost:${PORT}/chat.html\n`);
});
