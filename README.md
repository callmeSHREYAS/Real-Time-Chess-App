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

Open `http://localhost:5173` in two browser tabs or windows. Both browser clients connect to the load balancer at `http://localhost:3000`; Nginx distributes matchmaking connections across backend ports `3001`–`3005`. Once a match is assigned, each browser opens a second Socket.IO connection directly to the match owner, authenticates it with its existing session token, and closes its matchmaking connection only after authentication succeeds.

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
- Each match records the backend that created it as its authoritative owner. Moves received by another backend are sent to that owner for validation and serialized processing.
- The server that atomically takes a pair from the shared queue is the selected match owner. Both clients authenticate their direct connection to that owner using the existing session token; no Redis keys or PostgreSQL schema are added for handoff.
- The Socket.IO Redis adapter forwards game-state and other room emissions to clients connected to any backend.
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

For Vite development, `.env.development` sets `VITE_PVP_URL=http://localhost:3000`. Override `VITE_PVP_URL` at build time for another deployment. Each backend advertises its browser-reachable URL using `PVP_PUBLIC_URL`; Compose defaults these to `http://localhost:3001` through `http://localhost:3005`. The `PVP_GAME_SERVER_URLS` mapping lets every backend resolve the authoritative owner's public URL, including when a player reconnects through another server. For deployment, set `PVP_GAME_SERVER_1_URL` through `PVP_GAME_SERVER_5_URL`, provide the matching `PVP_GAME_SERVER_URLS` mapping, and set `PVP_CORS_ORIGINS` to the frontend origins. Do not put database credentials or other private values in `VITE_` variables.

## Cluster boundaries

The matchmaking connection initially lands on whichever backend Nginx selects. After a match is assigned, clients connect directly to the authoritative owner, authenticate using their existing session tokens, and then disconnect the original sockets. Both players share one logical game whose authoritative owner validates every move. Nginx uses passive failure handling (`max_fails`/`fail_timeout`), while health checks are available at each backend and through the balancer.

If the authoritative owner process fails, that match's moves fail closed rather than being accepted by a different process. Automatic owner election/failover and durable move transactions are not included and need a separate design.

## Useful commands

```bash
npm run dev          # Start Vite on port 5173
npm run cluster:up   # Start PostgreSQL, Redis, 5 backends, and Nginx
npm run cluster:down # Stop the cluster (preserve named-volume data)
npm run build        # Build the client
npm run lint         # Run ESLint
```
