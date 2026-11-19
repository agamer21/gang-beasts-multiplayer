const http = require('node:http');
const express = require('express');
const { ExpressPeerServer } = require('peer');
const { WebSocketServer } = require('ws');
const { httpsSignaling } = require('./https-signaling.cjs');

const port = Number(process.env.PORT || 10000);
const arcadeOrigin = process.env.ARCADE_ORIGIN || 'https://agamer21.github.io';
const app = express();
const server = http.createServer(app);

app.disable('x-powered-by');
app.get('/health', (_request, response) => response.json({ status: 'ok' }));

app.use('/signal', ExpressPeerServer(server, {
  allow_discovery: false,
  concurrent_limit: 100,
  corsOptions: { origin: arcadeOrigin },
  createWebSocketServer: options => new WebSocketServer({
    ...options,
    maxPayload: 65536,
    verifyClient: ({ origin }) => origin === arcadeOrigin
  })
}));

app.use('/rooms', httpsSignaling({ port, arcadeOrigin }));

server.listen(port, '0.0.0.0', () => console.log('Room signaling server listening on port', port));
