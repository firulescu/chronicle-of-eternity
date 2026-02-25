const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

app.get('/', (req, res) => res.send('Chronicle of Eternity Server Online ✅'));

const players = {};

io.on('connection', (socket) => {
  console.log('[+]', socket.id, 'Total:', Object.keys(players).length + 1);
  socket.emit('init', { players: Object.values(players), yourId: socket.id });

  socket.on('join', (data) => {
    players[socket.id] = { id: socket.id, name: data.name||'Wanderer', x: data.x||1000, y: data.y||1000, zone: data.zone||0, hp: data.hp||100, maxHp: data.maxHp||100, level: data.level||1, charClass: data.charClass||'Knight', chatMsg: '', chatTimer: 0 };
    socket.broadcast.emit('playerJoined', players[socket.id]);
    socket.emit('joinedOk', { id: socket.id });
    console.log('[JOIN]', data.name, 'Total:', Object.keys(players).length);
  });

  socket.on('move', (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    Object.keys(players).forEach(id => { if (id !== socket.id && players[id].zone === data.zone) io.to(id).emit('playerMoved', { id: socket.id, ...data }); });
  });

  socket.on('chat', (data) => {
    if (!players[socket.id]) return;
    const msg = String(data.msg||'').slice(0,120);
    players[socket.id].chatMsg = msg; players[socket.id].chatTimer = Date.now();
    io.emit('chatMsg', { id: socket.id, name: players[socket.id].name, msg, zone: players[socket.id].zone, timestamp: Date.now() });
  });

  socket.on('pvpAttack', (data) => {
    const a = players[socket.id], t = players[data.targetId];
    if (!a || !t || a.zone !== t.zone || Math.hypot(a.x-t.x, a.y-t.y) > 120) return;
    const dmg = Math.max(1, (data.atk||10) - Math.floor(Math.random()*3));
    t.hp = Math.max(0, t.hp - dmg);
    io.to(data.targetId).emit('pvpHit', { fromId: socket.id, fromName: a.name, dmg, newHp: t.hp });
    socket.emit('pvpHitConfirm', { targetId: data.targetId, dmg });
    if (t.hp <= 0) { io.to(data.targetId).emit('pvpKilled', { byName: a.name }); socket.emit('pvpKill', { targetName: t.name }); setTimeout(() => { if (players[data.targetId]) { players[data.targetId].hp = players[data.targetId].maxHp; io.to(data.targetId).emit('pvpRespawn'); } }, 5000); }
  });

  socket.on('tradeRequest', (data) => {
    const f = players[socket.id], t = players[data.targetId];
    if (!f || !t) return;
    io.to(data.targetId).emit('tradeRequested', { fromId: socket.id, fromName: f.name, offer: data.offer||[] });
    socket.emit('tradeRequestSent', { toName: t.name });
  });

  socket.on('tradeAccept', (data) => {
    io.to(data.fromId).emit('tradeCompleted', { withId: socket.id, withName: players[socket.id]?.name, theirOffer: data.counterOffer||[] });
    socket.emit('tradeCompleted', { withId: data.fromId, withName: players[data.fromId]?.name, theirOffer: [] });
  });

  socket.on('tradeDecline', (data) => { io.to(data.fromId).emit('tradeDeclined', { byName: players[socket.id]?.name }); });

  socket.on('disconnect', () => {
    if (players[socket.id]) { console.log('[-]', players[socket.id].name); socket.broadcast.emit('playerLeft', { id: socket.id }); delete players[socket.id]; }
  });
});

setInterval(() => { if (Object.keys(players).length > 0) io.emit('syncPlayers', Object.values(players)); }, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🎮 Server on port', PORT));
