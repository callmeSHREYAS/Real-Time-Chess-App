# Chess Arena

A React/Vite chess application with a local computer opponent and online PvP quick matchmaking.

## Run locally

Install dependencies:

```bash
npm install
```

Start the Vite client in one terminal:

```bash
npm run dev
```

Start the Socket.IO PvP server in another terminal:

```bash
npm run server
```

Open `http://localhost:5173` in two browser tabs or windows. Choose **Play Vs PVP**, enter a different username in each tab, and choose **Quick Match**. The first player waits in the queue; the second player starts the match.

## PvP behavior

- The first matched player receives White and the second receives Black.
- The server owns the canonical board and validates every move.
- Castling, en passant, promotion, captures, check, checkmate, and stalemate use the shared chess engine.
- Promotion opens the existing piece-selection modal.
- Closing a tab or losing the connection ends the match for the remaining player.
- Usernames are trimmed and must contain 2 to 20 characters.
- Play Vs Friend is still a placeholder.

## Commands

```bash
npm run dev       # Start the Vite client
npm run server    # Start the Socket.IO server on port 3001
npm run build     # Build the client
npm run lint      # Run ESLint
```
