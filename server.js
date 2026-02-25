const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const players = {};

io.on('connection', (socket) => {
  console.log('[+] Connected:', socket.id);

  socket.emit('init', { players: Object.values(players), yourId: socket.id });

  socket.on('join', (data) => {
    players[socket.id] = { id: socket.id, name: data.name || 'Wanderer', x: data.x || 1000, y: data.y || 1000, zone: data.zone || 0, hp: data.hp || 100, maxHp: data.maxHp || 100, level: data.level || 1, charClass: data.charClass || 'Knight', chatMsg: '', chatTimer: 0 };
    socket.broadcast.emit('playerJoined', players[socket.id]);
    socket.emit('joinedOk', { id: socket.id });
    console.log('[JOIN]', data.name);
  });

  socket.on('move', (data) => {
    if (!players[socket.id]) return;
    Object.assign(players[socket.id], data);
    Object.keys(players).forEach(id => {
      if (id !== socket.id && players[id].zone === data.zone) io.to(id).emit('playerMoved', { id: socket.id, ...data });
    });
  });

  socket.on('chat', (data) => {
    if (!players[socket.id]) return;
    const msg = String(data.msg || '').slice(0, 120);
    players[socket.id].chatMsg = msg;
    players[socket.id].chatTimer = Date.now();
    io.emit('chatMsg', { id: socket.id, name: players[socket.id].name, msg, zone: players[socket.id].zone, timestamp: Date.now() });
  });

  socket.on('pvpAttack', (data) => {
    const attacker = players[socket.id], target = players[data.targetId];
    if (!attacker || !target || attacker.zone !== target.zone) return;
    if (Math.hypot(attacker.x - target.x, attacker.y - target.y) > 120) return;
    const dmg = Math.max(1, (data.atk || 10) - Math.floor(Math.random() * 3));
    target.hp = Math.max(0, target.hp - dmg);
    io.to(data.targetId).emit('pvpHit', { fromId: socket.id, fromName: attacker.name, dmg, newHp: target.hp });
    socket.emit('pvpHitConfirm', { targetId: data.targetId, dmg, targetHp: target.hp });
    if (target.hp <= 0) {
      io.to(data.targetId).emit('pvpKilled', { byName: attacker.name });
      socket.emit('pvpKill', { targetName: target.name });
      setTimeout(() => { if (players[data.targetId]) { players[data.targetId].hp = players[data.targetId].maxHp; io.to(data.targetId).emit('pvpRespawn'); } }, 5000);
    }
  });

  socket.on('tradeRequest', (data) => {
    const from = players[socket.id], to = players[data.targetId];
    if (!from || !to) return;
    io.to(data.targetId).emit('tradeRequested', { fromId: socket.id, fromName: from.name, offer: data.offer || [] });
    socket.emit('tradeRequestSent', { toName: to.name });
  });

  socket.on('tradeAccept', (data) => {
    io.to(data.fromId).emit('tradeCompleted', { withId: socket.id, withName: players[socket.id]?.name, theirOffer: data.counterOffer || [] });
    socket.emit('tradeCompleted', { withId: data.fromId, withName: players[data.fromId]?.name, theirOffer: [] });
  });

  socket.on('tradeDecline', (data) => { io.to(data.fromId).emit('tradeDeclined', { byName: players[socket.id]?.name }); });

  socket.on('disconnect', () => {
    if (players[socket.id]) { console.log('[-]', players[socket.id].name); socket.broadcast.emit('playerLeft', { id: socket.id }); delete players[socket.id]; }
  });
});

setInterval(() => { io.emit('syncPlayers', Object.values(players)); }, 2000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Chronicle of Eternity server running on port', PORT));
