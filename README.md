# Chess Arena

A React/Vite chess application with a local computer opponent and online PvP quick matchmaking.

## Run locally

Install dependencies:

```bash
npm install
```

Start the shared PostgreSQL/Redis services, five PvP backends, and Nginx:

```bash
npm run cluster:up
```

Run the Vite client on port 5173 in another terminal:

```bash
npm run dev
```

Open `http://localhost:5173` in two browser tabs or windows. Both browser clients initially connect to the load balancer at `http://localhost:3000`; Nginx distributes matchmaking connections across backend ports `3001`–`3005`. After a match is created, both clients open a second Socket.IO connection directly to its selected game server and close their matchmaking connections only after authentication succeeds.

In each tab choose **Play Vs PVP**, enter a different username, and choose **Quick Match**. Make a legal move and confirm both boards update. The server rejects illegal moves; backend logs show which server owns the match and the version of each accepted move.

To inspect readiness and backend selection:

```bash
curl http://localhost:3000/healthz
curl http://localhost:3001/healthz
curl http://localhost:3002/healthz
curl http://localhost:3003/healthz
curl http://localhost:3004/healthz
curl http://localhost:3005/healthz
```

The load-balancer health endpoint proxies to one healthy backend and returns its `serverId` and port. Repeat requests to see backend selection. To view connections, ownership, and accepted-move logs:

```bash
docker compose logs -f game-server-1 game-server-2 game-server-3 game-server-4 game-server-5
```

To stop the cluster while keeping database data:

```bash
npm run cluster:down
```

## PvP behavior

- The first matched player receives White and the second receives Black.
- All five backend containers share one Redis instance and one PostgreSQL instance.
- Each match records the selected backend as its authoritative owner. Moves received by another backend are sent to that owner for validation and serialized processing.
- Matchmaking selects an active game server from Redis heartbeats. Both clients receive the same match ID, selected server URL, and separate one-time handoff credentials.
- Each client opens a new Socket.IO connection to the selected server. The game server validates the credential, transfers the player's active socket registration, joins the socket to the room named by the match ID, and sends the initial game state. The matchmaking socket is closed only after the new connection authenticates.
- The Socket.IO Redis adapter forwards room and server-side events between backend containers.
- Clients use WebSocket-only transport through Nginx, so HTTP long-polling session affinity is not required.
- Match creation atomically claims both queued players in Redis. Backend startup does not flush shared matchmaking or game keys.
- If a matchmaking server disconnects a queued client, the client reconnects through Nginx and the old queue socket ID is atomically replaced while preserving that player's queue position.
- If a match owner becomes unreachable, a connected client recovers through the load balancer. Redis atomically changes the existing match's `ownerId` to the first recovery server; the other client is redirected to that owner. Existing session tokens and Redis/PostgreSQL data structures are reused, and stale writes from the previous owner are rejected.
- A disconnected player can reconnect to the same match for 30 seconds; after that, the match ends and the disconnected player's resume record and session-token mapping are removed.
- If both players disconnect before either reconnects, the match ends immediately and both players' session-token mappings and disconnected-user records are removed.
- When a match ends (timeout, leaving, checkmate, or stalemate), both connected players are shown the end reason on the PvP dashboard before the server disconnects their sockets and removes their active player records.
- Castling, en passant, promotion, captures, check, checkmate, and stalemate use the shared chess engine.
- Promotion opens the existing piece-selection modal.
- Closing a tab or losing the connection gives the player 30 seconds to reconnect before the match ends for the remaining player.
- Usernames are trimmed and must contain 2 to 20 characters.
- PostgreSQL stores unique, case-insensitive usernames and the active socket-to-user mapping.
- Redis stores the FIFO matchmaking queue, active player session state, and game snapshots.
- Play Vs Friend is still a placeholder.

The database schema is in `PVPServices/Models/schema.sql`. Compose persists PostgreSQL and Redis data in named volumes. PostgreSQL and Redis are exposed on host ports `15432` and `16379`; the application backends are exposed on `3001`–`3005`, and Nginx is exposed on `3000`. The default database credentials are intended for local development only. Set `DATABASE_URL` or `REDIS_URL` to override the server defaults when running a backend outside Compose.

For Vite development, `.env.development` sets `VITE_PVP_URL=http://localhost:3000`. Override `VITE_PVP_URL` at build time for another deployment. `PVP_GAME_SERVERS` lists each server ID and its browser-reachable URL; Compose defaults these to `http://localhost:3001` through `http://localhost:3005`. For deployment, set `PVP_GAME_SERVER_1_URL` through `PVP_GAME_SERVER_5_URL` and set `PVP_CORS_ORIGINS` to the frontend origins. Do not put database credentials or other private values in `VITE_` variables.

## Cluster boundaries

After matchmaking, each browser connects directly to the selected backend. `PVP_GAME_SERVERS` must list each server ID and a URL reachable from the browser; the Compose defaults use `localhost:3001`–`localhost:3005`. For a deployment, replace these URLs with the public browser-accessible addresses and set `PVP_CORS_ORIGINS` on all backends to the frontend origin(s). Nginx still load-balances the initial matchmaking connection and provides health checks.

If the match owner becomes unreachable, a client reconnects through the load balancer. Redis atomically elects a live server as the new owner, updates the existing match's `ownerId`, and fences stale writes from the previous owner. If another client already completed recovery, the reconnecting client is redirected to the elected owner.

## Useful commands

```bash
npm run dev          # Start Vite on port 5173
npm run cluster:up   # Start PostgreSQL, Redis, 5 backends, and Nginx
npm run cluster:down # Stop the cluster (preserve named-volume data)
npm run build        # Build the client
npm run lint         # Run ESLint
```
