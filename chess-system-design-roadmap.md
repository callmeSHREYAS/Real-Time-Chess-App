# System Design for a Real-Time Chess App — First Principles

You already have a working server-authoritative PvP chess app. This doc explains *why* real-time multiplayer games are architected the way they are, then gives you a concrete, staged roadmap to take your current single-process server into something that looks like a real production system.

---

## Part 1: The First Principles

Before naming any technology, understand the actual problems you're solving. Every decision below falls out of these.

### Principle 1 — Someone must own the truth

In any multiplayer game, two players can send conflicting information ("I moved my knight to E5" vs "no you didn't, it's my turn"). Something has to be the single source of truth for "what is the current state of the board."

You already made the right call here: **the server owns the board**, clients just render it and send move *requests*. This is called **server-authoritative** architecture. The alternative — trusting the client's board state — is how every early online game got cheated to death (client says "I have 999 HP" and the server believes it).

This principle doesn't change as you scale. What changes is: *which server*. Right now it's "the one Node process." Later it becomes "one of N processes, so which one, and how does it know the game state?"

### Principle 2 — Real-time state needs a stateful connection

HTTP is stateless — each request is independent, easy to load-balance, easy to scale (any server can handle any request). But chess moves need to be **pushed** to the opponent the instant they happen. That needs a persistent, two-way connection — a WebSocket (which is what Socket.IO gives you).

The cost of this: a WebSocket connection is *pinned* to one specific server process. Client A is connected to Server 1. If Server 1 restarts or if Client A's next request happens to land on Server 2 (as a load balancer would normally do), the connection breaks. **This single fact — "real-time connections are sticky" — is the root of almost every scaling challenge in this doc.** Everything about Redis, pub/sub, and sticky sessions below exists to work around this one constraint.

### Principle 3 — In-memory state doesn't survive multiple processes

Right now your `waitingQueue`, `playersBySocket`, and `gamesById` are plain JS `Map`s and arrays living in one process's RAM. This works perfectly... as long as there's exactly one process.

The moment you run two server instances (for more capacity, or for redundancy), you get a split-brain problem: Player A's move went to Server 1, which has the board in its memory. Player B is connected to Server 2, which has never heard of that game. Two servers, two separate realities.

The fix is always the same shape: **move shared state out of any one process's memory into a separate, shared store** that every server instance can read and write. That's the entire reason Redis enters this picture — not because it's trendy, but because "shared state across processes" is a hard requirement the moment you have more than one server.

### Principle 4 — Matching two people is a queueing problem

Matchmaking ("Quick Match") is fundamentally: maintain a waiting line, and whenever ≥2 people are in it, pull two out and pair them. Your current implementation (`waitingQueue.shift()` twice) is exactly this, done correctly, in memory.

The first scaling wrinkle: if you have 2 server processes, and Player A's "join queue" hits Server 1 while Player B's hits Server 2, they'll never see each other — each server only knows about its own half of the queue. So the queue, like the game state, needs to live somewhere shared once you have multiple servers.

The next wrinkle (a feature one, not just a scaling one): fair matchmaking usually isn't FIFO — it's by skill (ELO/Glicko rating), so a 200-rated beginner doesn't get paired against a 2400-rated player just because they clicked "quick match" at the same second.

### Principle 5 — Persistence and "live state" are different problems with different tools

There are two very different categories of data in a chess app:

| Live, ephemeral, changes every few seconds | Durable, changes rarely, needs to survive forever |
|---|---|
| Current board position mid-game | Finished games (for history/replay) |
| Whose turn it is | User accounts, passwords/OAuth |
| Matchmaking queue | Ratings over time |
| Who's connected right now | Friend lists |

The first category wants something **fast to read/write, okay to lose on a rare crash** (a live game restarting is annoying, not catastrophic) — that's what **Redis / an in-memory store** is for.

The second category wants **durability, structured queries** ("show me all games where I played black and won") — that's what a real **database** (Postgres/MongoDB) is for.

A very common beginner mistake is trying to use one tool for both jobs. Don't put live per-move board state in Postgres (too slow for the write-every-second pattern, and you don't need history of every intermediate board position); don't rely on Redis for "permanent" data like accounts (it's an in-memory store — durability is a secondary feature, not its purpose).

### Principle 6 — Failure is normal, not exceptional

Someone's WiFi will drop mid-game. A server process will crash or get redeployed. Your current code already handles the easy version of this (`socket.on('disconnect')` ends the match immediately). The harder, more realistic version: **give the disconnected player a grace period to reconnect and resume**, instead of instantly ending the game. This requires the game state to *outlive* any single socket connection — another reason it can't just live in a variable tied to that connection.

### Principle 7 — Horizontal scaling requires giving up "just one copy of everything"

There are two ways to handle more load: make one machine bigger (**vertical scaling** — simple, but has a ceiling, and one crash takes everything down), or run more machines (**horizontal scaling** — no real ceiling, and one crashing doesn't kill everything, but now every piece of shared state has to be re-architected to be shareable, per Principle 3).

Almost everything in "Part 2" below is the concrete mechanics of horizontal scaling for exactly your app.

---

## Part 2: Target Architecture

Here's the shape you're aiming for, built directly from the principles above. Boxes are processes/services, arrows are data flow.

```
                     ┌─────────────────┐
        WebSocket    │   Load Balancer  │
    ┌────────────────│  (sticky sessions)│
    │                └─────────────────┘
    │                    │         │
    ▼                    ▼         ▼
┌────────┐         ┌─────────┐ ┌─────────┐
│ Client │◄───────►│ Server 1│ │ Server 2│   ← stateless app servers
└────────┘  WS     └────┬────┘ └────┬────┘      (Socket.IO + your
                         │           │            existing chess engine)
                         ▼           ▼
                  ┌───────────────────────┐
                  │   Redis (shared)      │
                  │ - live game state     │   ← Principle 3 & 4
                  │ - matchmaking queue   │
                  │ - pub/sub for events  │   ← lets Server 1 tell
                  │ - presence/session    │      Server 2 "player X moved"
                  └───────────────────────┘
                         │
                         ▼
                  ┌───────────────────────┐
                  │  Postgres/MongoDB      │
                  │ - user accounts        │   ← Principle 5
                  │ - completed game log   │
                  │ - ratings history      │
                  └───────────────────────┘
```

**Why the pub/sub piece specifically:** say Player A is connected to Server 1 and Player B is connected to Server 2 (normal — the load balancer doesn't know they're in the same game). Player A moves. Server 1 validates it, writes the new board to Redis — but *Server 2* is the one holding Player B's actual WebSocket connection, so Server 1 has no direct way to push the update to B. The fix: Server 1 publishes "game X updated" to a Redis pub/sub channel; every server subscribes to it; Server 2 hears the message and pushes to B over its own socket. (In practice you don't hand-roll this — Socket.IO ships an official `@socket.io/redis-adapter` that does exactly this transparently: you emit like normal, it fans out across instances automatically.)

**Why sticky sessions still matter even with Redis:** Redis solves *state sharing*, but a given WebSocket connection is still physically one TCP connection to one server process. The load balancer needs to route Player A's reconnect attempts back to a server that's still holding (or can look up) their session — usually done with sticky sessions (route by cookie/IP hash) or, more robustly, by not caring which server they land on because *all* session/game state is in Redis and any server can pick it up (this is the better long-term design, and worth aiming for over sticky sessions).

---

## Part 3: Features Worth Adding (grouped by what they teach you)

You don't need all of these — pick based on what you want to learn next.

**Core PvP completeness**
- Reconnection with a grace window (say, 30s) instead of instant forfeit
- Move timers / chess clocks (Bullet/Blitz/Rapid) — introduces a new class of bug: time is now part of game state and must be synced carefully
- Resignation, draw offers, "play again" / rematch
- Play vs Friend via invite link/code (you already have the placeholder)

**Accounts & identity**
- Real auth (so usernames aren't just first-come-first-served strings in memory)
- Persistent profile: games played, win/loss/draw record

**Rating & matchmaking**
- ELO or Glicko-2 rating system, updated after each game
- Matchmaking by rating band instead of pure FIFO
- Leaderboard

**History & spectating**
- Store finished games (moves list, PGN-style) so users can review past games
- Live spectator mode — read-only viewers subscribing to a game's updates (good exercise in pub/sub fan-out)

**Scale & resilience (the "system design" ones)**
- Multiple server instances + Redis adapter for Socket.IO
- Redis-backed matchmaking queue and game state (see roadmap)
- Rate limiting (stop someone from spamming `submit-move` or `join-quick-match`)
- Basic observability: structured logs, a metrics endpoint (active games, queue depth, connections per instance)

---

## Part 4: Step-by-Step Roadmap

Ordered so each stage is buildable on what came before, and each stage teaches one concept at a time rather than everything at once.

### Stage 0 — Harden what you have (do this first, it's cheap and it's real learning)
- Fix reconnection: instead of `endGame` immediately on disconnect, mark the player "disconnected" with a timestamp, keep the game alive in memory, and only end it if they don't reconnect within N seconds.
- Add a lightweight session token (random ID sent to the client, stored client-side) so a refreshed/reconnected tab can say "I'm player X in match Y" instead of relying on the raw socket ID surviving.
- **What this teaches:** the difference between "connection identity" (socket ID, ephemeral) and "player identity" (should survive reconnects) — a distinction every real-time app needs.

### Stage 1 — Introduce Redis, but only for what actually needs sharing
- Stand up a single Redis instance (local, then later hosted).
- Move **game state** (`gamesById`) into Redis as JSON blobs keyed by `matchId`. Keep it simple: `SET`/`GET` the whole game object per move — don't over-engineer with hashes yet.
- Move the **matchmaking queue** into a Redis `LIST`.
- Your server is still a single process at this stage — the point isn't scaling yet, it's proving your data model works when it's not just a JS variable.
- **What this teaches:** serialization boundaries — you can no longer just mutate a JS object in place; you read, deserialize, mutate, serialize, write.

### Stage 2 — Go multi-instance
- Run two copies of your server (`PORT=3001` and `PORT=3002` locally) behind a simple load balancer (nginx, or even just two entries in your dev setup).
- Install `@socket.io/redis-adapter` and wire it up — this is what makes `io.to(socketId).emit(...)` work correctly even when that socket is connected to the *other* instance.
- Verify: open two browser tabs, force them (however you can locally) onto different server instances, and confirm a match between them still works.
- **What this teaches:** the sticky-connection problem from Principle 2, solved concretely.

### Stage 3 — Add a real database for durable data
- Add Postgres (or MongoDB, whichever you're more comfortable with from your other projects).
- Schema: `users`, `games` (finished games with move list + result), `ratings` — completely separate from the Redis live-state layer.
- On game end, write the final result from Redis into the durable `games` table, then you can safely let the Redis key expire.
- **What this teaches:** Principle 5 in practice — writing an ETL-style "live → durable" handoff, which is a pattern you'll see everywhere (cache → DB, hot storage → cold storage, etc).

### Stage 4 — Accounts, ratings, better matchmaking
- Real auth (even simple JWT-based auth is fine).
- Implement ELO update logic on game completion.
- Change matchmaking from pure FIFO to rating-band matching (e.g., "look for opponents within ±100 rating; widen the band the longer you wait" — this alone is a nice small algorithm to design).
- **What this teaches:** matchmaking as a genuine algorithmic problem, not just a queue.

### Stage 5 — Resilience & observability
- Rate limit `submit-move`/`join-quick-match` per socket (Redis is great for this — a simple counter with expiry).
- Add structured logging and a couple of metrics (active games, queue length, connected clients per instance) — even just logging these periodically is a huge step up.
- Chaos-test yourself: kill one server instance mid-game and confirm the other instance + Redis let the game survive (this is the real payoff of Stage 1–2's work).

### Stage 6 (optional, high-value) — Spectating & history UI
- Read-only "watch this game" mode using the same pub/sub channel, just without move-submission rights.
- A "past games" page reading from your Stage 3 database, with a simple board replay (step through the stored move list).

---

## How this maps back to your code

- `applyChessMove.js` doesn't need to change for any of this — it's pure game logic and is correctly decoupled from transport/storage already. That separation is exactly why this refactor is tractable.
- `pvpServer.js`'s `gamesById`/`waitingQueue`/`playersBySocket` are precisely the three things that move into Redis in Stage 1.
- The `sendGameState`/`getGameSnapshot` pattern stays essentially as-is; it just starts reading from Redis instead of the in-memory `Map` before emitting.

If you want, I can help you actually implement Stage 0 or Stage 1 next — happy to start with the reconnection-grace-period logic or the Redis game-state migration, whichever you'd rather tackle first.
