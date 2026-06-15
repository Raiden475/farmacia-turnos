const socket = io();
let username = '';
let typingTimer = null;
let isTyping = false;

// Historial privado: { "nombreUsuario": [msgs] }
const privateHistory = {};
// Mensajes no leídos por usuario
const unreadCounts = {};
// Tab activa actualmente
let activeTab = 'general';

// Paleta de colores para avatares
const COLORS = ['#1565c0','#6a1b9a','#00695c','#c62828','#558b2f','#e65100','#4527a0','#2e7d32'];
const userColors = {};
function colorFor(name) {
  if (!userColors[name]) {
    const idx = Object.keys(userColors).length % COLORS.length;
    userColors[name] = COLORS[idx];
  }
  return userColors[name];
}
function initial(name) { return name.charAt(0).toUpperCase(); }

// ── LOGIN ────────────────────────────────────────────────────
document.getElementById('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') joinChat();
});

function joinChat() {
  const name = document.getElementById('nameInput').value.trim();
  if (!name) return;
  username = name;
  userColors[username] = COLORS[0];

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('chatScreen').style.display  = 'block';

  socket.emit('user-joined', { user: username });

  document.getElementById('myAvatar').textContent      = initial(username);
  document.getElementById('myAvatar').style.background = colorFor(username);
  document.getElementById('myName').textContent        = username;

  focusInput('general');
}

// ── TABS ─────────────────────────────────────────────────────
function openPrivateChat(targetUser) {
  if (targetUser === username) return;

  // Inicializar historial si no existe
  if (!privateHistory[targetUser]) privateHistory[targetUser] = [];
  unreadCounts[targetUser] = 0;

  // Crear tab si no existe
  if (!document.getElementById(`tab-${CSS.escape(targetUser)}`)) {
    createTab(targetUser);
    createPanel(targetUser);
  }

  switchTab(targetUser);
  updateSidebarUser(targetUser);
}

function createTab(targetUser) {
  const color = colorFor(targetUser);
  const tab = document.createElement('div');
  tab.className = 'tab';
  tab.id = `tab-${targetUser}`;
  tab.onclick = () => switchTab(targetUser);
  tab.innerHTML = `
    <div class="tab-av" style="background:${color}">${initial(targetUser)}</div>
    <span>${targetUser}</span>
    <div class="tab-unread" id="tab-unread-${targetUser}" style="display:none">0</div>
    <div class="close-tab" onclick="closePrivateChat('${targetUser}', event)">✕</div>`;
  document.getElementById('tabsBar').appendChild(tab);
}

function createPanel(targetUser) {
  const color = colorFor(targetUser);
  const panel = document.createElement('div');
  panel.className = 'conv-panel private';
  panel.id = `panel-${targetUser}`;
  panel.innerHTML = `
    <div class="conv-topbar">
      <div class="ct-left">
        <div class="ct-av" style="background:${color}">${initial(targetUser)}</div>
        <div>
          <h1>${targetUser}</h1>
          <p>Conversación privada</p>
        </div>
      </div>
      <span class="private-badge">🔒 Privado</span>
    </div>
    <div class="messages" id="msgs-${targetUser}">
      <div class="sys-msg">Inicio de la conversación privada con ${targetUser}</div>
    </div>
    <div class="typing-bar" id="typing-${targetUser}"></div>
    <div class="input-bar">
      <textarea id="input-${targetUser}"
        placeholder="Mensaje privado para ${targetUser}... (Enter para enviar)"
        rows="1"
        oninput="onPrivateInput(this, '${targetUser}')"
        onkeydown="onPrivateKey(event, '${targetUser}')"></textarea>
      <button class="send-btn" onclick="sendPrivate('${targetUser}')">➤</button>
    </div>`;
  document.getElementById('panelsContainer').appendChild(panel);

  // Cargar historial si hay mensajes previos
  privateHistory[targetUser].forEach(m => renderPrivateMsg(m, targetUser));

  // Auto-resize textarea
  const ta = document.getElementById(`input-${targetUser}`);
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  });
}

function switchTab(tabId) {
  activeTab = tabId;

  // Marcar tabs
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById(`tab-${tabId}`);
  if (tab) tab.classList.add('active');

  // Mostrar panel correcto
  document.querySelectorAll('.conv-panel').forEach(p => p.classList.remove('active'));
  const panel = document.getElementById(`panel-${tabId}`);
  if (panel) panel.classList.add('active');

  // Limpiar no leídos
  if (tabId !== 'general' && unreadCounts[tabId] > 0) {
    unreadCounts[tabId] = 0;
    const badge = document.getElementById(`tab-unread-${tabId}`);
    if (badge) badge.style.display = 'none';
    updateSidebarUser(tabId);
  }

  focusInput(tabId);
}

function closePrivateChat(targetUser, event) {
  event.stopPropagation();
  document.getElementById(`tab-${targetUser}`)?.remove();
  document.getElementById(`panel-${targetUser}`)?.remove();
  delete privateHistory[targetUser];
  delete unreadCounts[targetUser];
  updateSidebarUser(targetUser);
  if (activeTab === targetUser) switchTab('general');
}

function focusInput(tabId) {
  setTimeout(() => {
    const id = tabId === 'general' ? 'msgInput' : `input-${tabId}`;
    document.getElementById(id)?.focus();
  }, 50);
}

// ── CHAT GENERAL ─────────────────────────────────────────────
const textarea = document.getElementById('msgInput');
textarea.addEventListener('input', () => {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
  if (!isTyping) { isTyping = true; socket.emit('typing-start', { user: username }); }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { isTyping = false; socket.emit('typing-stop', { user: username }); }, 1500);
});
textarea.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGeneral(); }
});

function sendGeneral() {
  const text = textarea.value.trim();
  if (!text) return;
  socket.emit('chat-message', { user: username, text });
  textarea.value = ''; textarea.style.height = 'auto';
  clearTimeout(typingTimer); isTyping = false;
  socket.emit('typing-stop', { user: username });
}

// ── CHAT PRIVADO ─────────────────────────────────────────────
function onPrivateKey(e, targetUser) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPrivate(targetUser); }
}

function onPrivateInput(el, targetUser) {
  socket.emit('private-typing-start', { from: username, to: targetUser });
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    socket.emit('private-typing-stop', { from: username, to: targetUser });
  }, 1500);
}

function sendPrivate(targetUser) {
  const input = document.getElementById(`input-${targetUser}`);
  const text  = input.value.trim();
  if (!text) return;
  socket.emit('private-message', { from: username, to: targetUser, text });
  input.value = ''; input.style.height = 'auto';
  socket.emit('private-typing-stop', { from: username, to: targetUser });
}

// ── RENDER ───────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });
}
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}
function scrollBottom(containerId) {
  const el = document.getElementById(containerId);
  if (el) setTimeout(() => { el.scrollTop = el.scrollHeight; }, 40);
}

function addSysMsg(text, containerId = 'msgs-general') {
  const el = document.createElement('div');
  el.className = 'sys-msg'; el.textContent = text;
  document.getElementById(containerId)?.appendChild(el);
  scrollBottom(containerId);
}

function addGeneralMsg(msg) {
  const isMine = msg.user === username;
  const color  = colorFor(msg.user);
  const group  = document.createElement('div');
  group.className = `msg-group ${isMine ? 'mine' : 'theirs'}`;
  group.innerHTML = `
    <div class="msg-header">
      <div class="msg-av" style="background:${color}">${initial(msg.user)}</div>
      <span class="sender">${isMine ? 'Vos' : esc(msg.user)}</span>
      <span class="ts">${msg.time || nowTime()}</span>
    </div>
    <div class="bubble">${esc(msg.text)}</div>`;
  document.getElementById('msgs-general').appendChild(group);
  scrollBottom('msgs-general');
}

function renderPrivateMsg(msg, targetUser) {
  const isMine    = msg.from === username;
  const otherUser = isMine ? msg.to : msg.from;
  const color     = colorFor(isMine ? username : otherUser);
  const container = `msgs-${targetUser}`;

  const group = document.createElement('div');
  group.className = `msg-group ${isMine ? 'mine' : 'theirs'}`;
  group.innerHTML = `
    <div class="msg-header">
      <div class="msg-av" style="background:${color}">${initial(isMine ? username : otherUser)}</div>
      <span class="sender">${isMine ? 'Vos' : esc(otherUser)}</span>
      <span class="ts">${msg.time || nowTime()}</span>
    </div>
    <div class="bubble">${esc(msg.text)}</div>`;
  document.getElementById(container)?.appendChild(group);
  scrollBottom(container);
}

// ── SIDEBAR ──────────────────────────────────────────────────
function renderUsers(users) {
  const list  = document.getElementById('usersList');
  document.getElementById('userCount').textContent   = `${users.length} conectado${users.length !== 1 ? 's' : ''}`;
  document.getElementById('onlineCount').textContent = users.length;
  document.getElementById('onlineCount2').textContent = users.length;

  list.innerHTML = users.map(u => {
    const isMine  = u === username;
    const color   = colorFor(u);
    const unread  = unreadCounts[u] || 0;
    const hasChat = !!privateHistory[u];
    return `
      <div class="user-item ${isMine ? 'me' : ''} ${activeTab === u ? 'active-chat' : ''}"
           onclick="${isMine ? '' : `openPrivateChat('${u}')`}"
           title="${isMine ? '' : `Iniciar chat privado con ${u}`}">
        <div class="user-av" style="background:${color}">${initial(u)}</div>
        <div class="user-info">
          <div class="uname">${esc(u)}${isMine ? ' (vos)' : ''}</div>
          <div class="urole">${isMine ? 'Tú' : (hasChat ? '💬 En conversación' : 'Clic para chatear')}</div>
        </div>
        ${unread > 0
          ? `<div class="unread-badge">${unread}</div>`
          : `<div class="online-dot"></div>`}
      </div>`;
  }).join('');
}

function updateSidebarUser(targetUser) {
  // Re-renderizar solo ese item actualizando badge
  const users = [...document.querySelectorAll('.user-item')].map(el => {
    return el.querySelector('.uname')?.textContent.replace(' (vos)', '');
  }).filter(Boolean);
  // Forzar re-render completo via users-update del estado local
  const allUsers = [...document.querySelectorAll('#usersList .user-item')]
    .map(el => el.querySelector('.uname').textContent.replace(' (vos)', '').trim());
  renderUsers(allUsers.length > 0 ? allUsers : [username]);
}

// ── TYPING INDICATORS ────────────────────────────────────────
const typingUsersGeneral = new Set();

function updateGeneralTyping() {
  const bar    = document.getElementById('typing-general');
  const others = [...typingUsersGeneral].filter(u => u !== username);
  bar.innerHTML = others.length === 0 ? '' :
    `<div class="t-dots"><span class="t-dot"></span><span class="t-dot"></span><span class="t-dot"></span></div>
     <span>${esc(others.join(', '))} ${others.length === 1 ? 'está' : 'están'} escribiendo...</span>`;
}

// ── SOCKET EVENTOS ───────────────────────────────────────────
socket.on('chat-history', (msgs) => {
  msgs.forEach(m => { if (!m.isBot) addGeneralMsg(m); });
});

socket.on('chat-message', (msg) => {
  if (msg.isBot) return;
  addGeneralMsg(msg);
  // Notificar si el tab general no está activo
  if (activeTab !== 'general' && msg.user !== username) {
    // parpadeo visual en la pestaña general
    const tab = document.getElementById('tab-general');
    tab.style.color = '#ef5350';
    setTimeout(() => tab.style.color = '', 2000);
  }
});

socket.on('users-update', (users) => {
  renderUsers(users);
});

socket.on('user-connected', (data) => {
  if (data.user !== username) addSysMsg(`${data.user} se unió al chat`);
});

socket.on('user-disconnected', (data) => {
  addSysMsg(`${data.user} salió del chat`);
  typingUsersGeneral.delete(data.user);
  updateGeneralTyping();
  // Avisar en chat privado si existe
  if (privateHistory[data.user] !== undefined) {
    addSysMsg(`${data.user} se desconectó`, `msgs-${data.user}`);
  }
});

socket.on('typing-start', (data) => {
  if (data.user !== username) { typingUsersGeneral.add(data.user); updateGeneralTyping(); }
});
socket.on('typing-stop', (data) => {
  typingUsersGeneral.delete(data.user); updateGeneralTyping();
});

// Mensajes privados entrantes
socket.on('private-message', (msg) => {
  const otherUser = msg.from === username ? msg.to : msg.from;

  // Guardar en historial
  if (!privateHistory[otherUser]) privateHistory[otherUser] = [];
  privateHistory[otherUser].push(msg);

  // Si el panel no existe aún, crearlo (mensaje entrante inesperado)
  if (!document.getElementById(`panel-${otherUser}`)) {
    createTab(otherUser);
    createPanel(otherUser);
    // No hacer switchTab automático, solo notificar
  }

  // Renderizar el mensaje
  renderPrivateMsg(msg, otherUser);

  // Si no estamos viendo ese chat, incrementar badge
  if (activeTab !== otherUser && msg.from !== username) {
    unreadCounts[otherUser] = (unreadCounts[otherUser] || 0) + 1;
    const badge = document.getElementById(`tab-unread-${otherUser}`);
    if (badge) { badge.textContent = unreadCounts[otherUser]; badge.style.display = 'flex'; }
    renderUsers([...connectedUsers]);
  }
});

// Typing privado
socket.on('private-typing-start', (data) => {
  const bar = document.getElementById(`typing-${data.from}`);
  if (bar) bar.innerHTML =
    `<div class="t-dots"><span class="t-dot"></span><span class="t-dot"></span><span class="t-dot"></span></div>
     <span>${esc(data.from)} está escribiendo...</span>`;
});
socket.on('private-typing-stop', (data) => {
  const bar = document.getElementById(`typing-${data.from}`);
  if (bar) bar.innerHTML = '';
});

// Guardar referencia de usuarios para re-render sidebar
const connectedUsers = new Set();
const origRenderUsers = renderUsers;
// Interceptar para guardar estado local
socket.on('users-update', (users) => {
  connectedUsers.clear();
  users.forEach(u => connectedUsers.add(u));
});
