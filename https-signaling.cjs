const { randomUUID } = require('node:crypto');
const { Router, json } = require('express');
const { WebSocket } = require('ws');

const peerIdPattern = /^(?:ag-arcade-gang-beasts-[a-f0-9]{8}|[a-f0-9-]{36})$/;
const messageTypes = new Set(['OFFER', 'ANSWER', 'CANDIDATE', 'LEAVE', 'HEARTBEAT']);

function httpsSignaling({ port, arcadeOrigin }) {
  const router = Router();
  const sessions = new Map();

  function clear(session) {
    sessions.delete(session.key);
    session.finishPoll?.();
    session.socket.terminate();
  }

  const sweep = setInterval(() => {
    for (const session of sessions.values()) {
      if (Date.now() - session.lastSeen > 45000) clear(session);
    }
  }, 5000);
  sweep.unref();

  router.use((req, res, next) => {
    if (req.get('Origin') !== arcadeOrigin) return res.sendStatus(403);
    res.set({
      'Access-Control-Allow-Origin': arcadeOrigin,
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '600',
      'Cache-Control': 'no-store',
      Vary: 'Origin'
    });
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  router.use(json({ limit: '64kb' }));

  router.post('/open', (req, res) => {
    const { id } = req.body ?? {};
    if (typeof id !== 'string' || !peerIdPattern.test(id)) return res.sendStatus(400);
    if (sessions.size >= 100) return res.sendStatus(503);
    const key = randomUUID();
    const query = new URLSearchParams({ key: 'peerjs', id, token: randomUUID() });
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/signal/peerjs?' + query, {
      origin: arcadeOrigin,
      handshakeTimeout: 5000
    });
    const session = { key, socket, messages: [], lastSeen: Date.now() };
    sessions.set(key, session);
    socket.on('message', data => {
      if (session.messages.length >= 128) {
        clear(session);
        return;
      }
      session.messages.push(data.toString());
      session.finishPoll?.();
    });
    socket.once('open', () => res.json({ key }));
    socket.once('close', () => session.finishPoll?.());
    socket.on('error', () => {
      if (!res.headersSent) res.sendStatus(502);
      clear(session);
    });
    res.once('close', () => { if (!res.writableEnded) clear(session); });
  });

  router.use((req, res, next) => {
    const session = sessions.get((req.get('Authorization') ?? '').replace(/^Bearer /, ''));
    if (!session) return res.sendStatus(404);
    session.lastSeen = Date.now();
    req.signaling = session;
    next();
  });

  router.post('/poll', (req, res) => {
    const session = req.signaling;
    if (session.finishPoll) return res.sendStatus(409);
    if (session.messages.length) return res.json(session.messages.splice(0));
    if (session.socket.readyState !== WebSocket.OPEN) return res.sendStatus(410);
    const done = () => {
      clearTimeout(timer);
      if (session.finishPoll === finish) session.finishPoll = undefined;
    };
    const finish = () => {
      done();
      res.json(session.messages.splice(0));
    };
    session.finishPoll = finish;
    const timer = setTimeout(finish, 10000);
    res.once('close', done);
  });

  router.post('/send', (req, res) => {
    const session = req.signaling;
    const message = req.body;
    if (session.socket.readyState !== WebSocket.OPEN) return res.sendStatus(410);
    if (!messageTypes.has(message?.type)) return res.sendStatus(400);
    if (message.type !== 'HEARTBEAT' && (typeof message.dst !== 'string' || !peerIdPattern.test(message.dst))) {
      return res.sendStatus(400);
    }
    session.socket.send(JSON.stringify({ type: message.type, dst: message.dst, payload: message.payload }));
    res.sendStatus(204);
  });

  router.post('/close', (req, res) => {
    clear(req.signaling);
    res.sendStatus(204);
  });

  return router;
}

module.exports = { httpsSignaling };
