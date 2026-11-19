# Gang Beasts room server

This server uses PeerJS to exchange WebRTC connection details between browsers on AG Arcade. The game runs in the host’s browser.

## Render setup

- Service type: Web Service
- Language: Node
- Branch: main
- Root directory: leave blank
- Build command: `npm ci --omit=dev`
- Start command: `npm start`
- Instance type: Free
- Health check path: `/health`

The server accepts browser connections from `https://agamer21.github.io`. Set `ARCADE_ORIGIN` to override that origin for local testing. PeerJS is mounted at `/signal`.

The service handles signaling. Browsers establish the audio/video and input connection separately. Testing across networks may require a TURN relay.
