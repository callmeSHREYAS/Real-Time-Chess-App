// Design overview
//
// Redis is the process-shared, durable source of truth: it holds game
// records, the matchmaking waiting queue, rate-limit counters, and the
// live player records (keyed by socket id and by session token). This
// process's memory holds only what is inherently per-process and
// temporary: the socket connection and the reconnect-grace timers. A
// stored game record only ever contains COPIES of players, so touching a
// live player never changes a record and vice versa.
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { applyChessMove } from '../src/computer/engine/applyChessMove.js'
import { Color, Piece } from '../src/computer/engine/board.js'
import { connectRedis, getGame, saveGame } from './redis.js'
import {
    RECONNECT_GRACE_PERIOD_MS,
    clearDisconnectTimer,
    endGame,
    forgetSession,
    forgetSocket,
    getLivePlayer,
    getLivePlayerBySession,
    isNameAvailable,
    makeNewPlayer,
    normalizeName,
    rememberSessionForPlayer,
    rememberSocketForPlayer,
    scheduleDisconnectExpiry,
} from './players.js'
import { JOIN_RATE_LIMIT, MOVE_RATE_LIMIT, isRateLimited } from './rateLimit.js'
import {
    enqueueForMatchmaking,
    pairPlayers,
    removePlayerFromQueue,
    removeSessionFromQueue,
    waitingQueueLength,
} from './matchmaking.js'

const PORT = Number(globalThis.process?.env?.PVP_PORT || 3001)
const NAME_PATTERN = /^.{2,20}$/u
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])

const httpServer = createServer()
export const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
    },
})

// --- socket payload helpers --------------------------------------------------

function reject(socket, reason) {
    socket.emit('move-rejected', { reason })
}

// Rebuild a view of the game that is safe to ship to a client: never leak
// session tokens or socket ids, only identity and position.
function getGameSnapshot(gameRecord) {
    return {
        matchId: gameRecord.matchId,
        board: gameRecord.board,
        currentTurn: gameRecord.currentTurn,
        gameState: gameRecord.gameState,
        enPassantSquare: gameRecord.enPassantSquare,
        gameStatus: gameRecord.gameStatus,
        capturedWhite: gameRecord.capturedWhite,
        capturedBlack: gameRecord.capturedBlack,
        players: gameRecord.players.map(({ name, color }) => ({ name, color })),
    }
}

export function sendGameState(gameRecord) {
    const snapshot = getGameSnapshot(gameRecord)
    for (const gamePlayerRecord of gameRecord.players) {
        if (!gamePlayerRecord.socketId) continue
        io.to(gamePlayerRecord.socketId).emit('game-state', {
            ...snapshot,
            yourColor: gamePlayerRecord.color,
            yourName: gamePlayerRecord.name,
            opponentName: gameRecord.players.find(other => other.socketId !== gamePlayerRecord.socketId)?.name || '',
        })
    }
}

// Patch one participant inside a stored game record (the copy that lives in
// Redis), never the live player object in process memory.
function updateGamePlayer(gameRecord, sessionToken, updates) {
    const gamePlayerRecord = gameRecord.players.find(record => record.sessionToken === sessionToken)
    if (gamePlayerRecord) Object.assign(gamePlayerRecord, updates)
    return gamePlayerRecord
}

// Tell the opponent of a two-player game about a life-cycle event. Skips
// anyone not currently on a socket so we never emit into the void.
function notifyOpponent(gameRecord, sessionToken, eventName, payload) {
    for (const gamePlayerRecord of gameRecord.players) {
        if (gamePlayerRecord.sessionToken !== sessionToken && gamePlayerRecord.socketId) {
            io.to(gamePlayerRecord.socketId).emit(eventName, payload)
        }
    }
}

// --- rate limiting ------------------------------------------------------------

// Joins are keyed by the remote address (or socket id as a fallback), moves
// by the socket id, so a single abusive socket can't saturate moves on other
// sockets behind one IP.
function getRateLimitIdentity(socket) {
    return socket.handshake.address || socket.id
}

async function rejectIfJoinRateLimited(socket) {
    return rejectIfRateLimited(socket, getRateLimitIdentity(socket), 'join', JOIN_RATE_LIMIT, 'queue-error', 'Too many matchmaking requests. Try again shortly.')
}

async function rejectIfMoveRateLimited(socket) {
    return rejectIfRateLimited(socket, socket.id, 'move', MOVE_RATE_LIMIT, 'move-rejected', 'Too many move requests. Try again shortly.')
}

async function rejectIfRateLimited(socket, identity, action, config, eventName, reason) {
    if (!(await isRateLimited(identity, action, config))) return false
    socket.emit(eventName, { reason })
    return true
}

// --- join-quick-match helpers -------------------------------------------------

function parseJoinPayload(payload) {
    const rawName = typeof payload === 'string' ? payload : payload?.name
    const sessionToken = typeof payload === 'string' ? null : payload?.sessionToken
    return { name: normalizeName(rawName), sessionToken }
}

function rejectInvalidSessionToken(socket, sessionToken) {
    if (typeof sessionToken === 'string' && SESSION_TOKEN_PATTERN.test(sessionToken)) return false
    socket.emit('queue-error', { reason: 'Invalid session token' })
    return true
}

// One session must never drive two sockets at once, so a second tab with the
// same token is refused instead of silently stealing the player.
function rejectSessionAlreadyConnected(socket, existingPlayer) {
    if (existingPlayer && existingPlayer.socketId && existingPlayer.socketId !== socket.id) {
        socket.emit('queue-error', { reason: 'This session is already connected' })
        return true
    }
    return false
}

function rejectInvalidName(socket, name) {
    if (NAME_PATTERN.test(name)) return false
    socket.emit('queue-error', { reason: 'Name must be between 2 and 20 characters' })
    return true
}

async function rejectNameUnavailable(socket, name, socketId) {
    if (await isNameAvailable(name, socketId)) return false
    socket.emit('queue-error', { reason: 'That username is already in use' })
    return true
}

// A disconnected-but-not-yet-expired player re-enters through their session:
// hook the new socket onto their existing live player and active match
// instead of making them queue up again from scratch.
async function rejoinActiveMatch(socket, livePlayer, sessionToken) {
    if (!livePlayer?.matchId || !livePlayer.disconnectedAt) return false

    const game = await getGame(livePlayer.matchId)
    if (!game) {
        socket.emit('queue-error', { reason: 'That match is no longer available' })
        return true
    }

    await clearDisconnectTimer(livePlayer)
    livePlayer.socketId = socket.id
    await rememberSocketForPlayer(socket.id, livePlayer)
    updateGamePlayer(game, sessionToken, { socketId: socket.id, disconnectedAt: null })
    await saveGame(game)
    socket.emit('reconnected', { matchId: game.matchId })
    sendGameState(game)
    notifyOpponent(game, sessionToken, 'player-reconnected', { name: livePlayer.name })
    return true
}

function rejectAlreadyInMatch(socket, livePlayer) {
    if (!livePlayer?.matchId) return false
    socket.emit('queue-error', { reason: 'You are already in a match' })
    return true
}

function rejectSessionBoundToAnotherName(socket, livePlayer, name) {
    if (!(livePlayer?.sessionToken && livePlayer.name !== name)) return false
    socket.emit('queue-error', { reason: 'This session belongs to another username' })
    return true
}

// Fresh join path: drop any older queue entry for this socket, (re)register
// the live player in Redis (by socket and by session), push the session
// onto the waiting list, tell the client where they sit, then attempt to
// make a match.
async function joinWaitingQueue(socket, sessionToken, name, livePlayer) {
    await removePlayerFromQueue(socket.id)
    const queuedPlayer = livePlayer || makeNewPlayer(sessionToken)
    queuedPlayer.socketId = socket.id
    queuedPlayer.name = name
    await rememberSocketForPlayer(socket.id, queuedPlayer)
    await rememberSessionForPlayer(sessionToken, queuedPlayer)
    await clearDisconnectTimer(queuedPlayer)
    console.log('player pushed in waiting queue');
    await enqueueForMatchmaking(sessionToken)
    socket.emit('queue-status', { position: await waitingQueueLength() })
    await pairPlayers()
}

// --- leave-match / leave-queue helpers ---------------------------------------

async function abandonMatch(livePlayer, socketId) {
    const game = livePlayer?.matchId ? await getGame(livePlayer.matchId) : null
    if (game) {
        await endGame(game)
        return
    }
    if (livePlayer) {
        await removeSessionFromQueue(livePlayer.sessionToken)
        await forgetSession(livePlayer.sessionToken)
        await forgetSocket(socketId)
    }
}

// --- submit-move helpers ------------------------------------------------------

function rejectNoActiveMatch(socket, game) {
    if (game) return false
    reject(socket, 'You are not in an active match')
    return true
}

function rejectFinishedGame(socket, game) {
    if (game.gameStatus === 'checkmate-white' || game.gameStatus === 'checkmate-black' || game.gameStatus === 'stalemate') {
        reject(socket, 'The game is already over')
        return true
    }
    return false
}

function rejectNotYourTurn(socket, game, livePlayer) {
    if (game.currentTurn !== livePlayer.color) {
        reject(socket, 'It is not your turn')
        return true
    }
    return false
}

function rejectMissingPromotionPiece(socket, game, payload) {
    const fromIdx = Number(payload?.fromIdx)
    const toIdx = Number(payload?.toIdx)
    const movingPiece = game.board[fromIdx]
    const reachesPromotionRank = movingPiece && (movingPiece & 0b00111) === Piece.Pawn && (toIdx < 8 || toIdx >= 56)
    const promotionType = payload?.promotionType ?? null

    if (reachesPromotionRank && !PROMOTION_TYPES.has(promotionType)) {
        reject(socket, 'Choose a promotion piece')
        return true
    }
    return false
}

function applyMove(game, payload) {
    return applyChessMove({
        board: game.board,
        currentTurn: game.currentTurn,
        fromIdx: Number(payload?.fromIdx),
        toIdx: Number(payload?.toIdx),
        gameState: game.gameState,
        enPassantSquare: game.enPassantSquare,
        promotionType: payload?.promotionType ?? null,
    })
}

function rejectInvalidMove(socket, result) {
    if (result.ok) return false
    reject(socket, result.reason)
    return true
}

async function applyResultToGameState(game, result) {
    game.board = result.board
    game.currentTurn = result.currentTurn
    game.gameState = result.gameState
    game.enPassantSquare = result.enPassantSquare
    game.gameStatus = result.gameStatus

    if (result.capturedPiece) {
        const capturedList = result.capturedPiece & 0b11000 === Color.White
            ? game.capturedWhite
            : game.capturedBlack
        capturedList.push({ piece: result.capturedPiece })
    }

    await saveGame(game)
    sendGameState(game)
}

// --- disconnect helpers --------------------------------------------------------

// A player who leaves mid-match is kept alive (socketId set to null) rather
// than removed, so a rejoin through their session can find the live object
// again; only the expiry timer removes them once the grace period elapses.
async function handlePlayerDisconnect(livePlayer) {
    if (!livePlayer?.matchId) return
    const game = await getGame(livePlayer.matchId)
    if (!game) return
    livePlayer.socketId = null
    await scheduleDisconnectExpiry(livePlayer, game)
    updateGamePlayer(game, livePlayer.sessionToken, { socketId: null, disconnectedAt: livePlayer.disconnectedAt })
    await saveGame(game)
    console.log("player-disconnected");
    notifyOpponent(game, livePlayer.sessionToken, 'player-disconnected', {
        name: livePlayer.name,
        gracePeriodSeconds: RECONNECT_GRACE_PERIOD_MS / 1000,
    })
}

// --- socket wiring -------------------------------------------------------------

io.on('connection', socket => {
    socket.on('join-quick-match', async payload => {
        if (await rejectIfJoinRateLimited(socket)) return

        const { name, sessionToken } = parseJoinPayload(payload)
        if (rejectInvalidSessionToken(socket, sessionToken)) return

        const existingPlayer = await getLivePlayerBySession(sessionToken)
        const livePlayer = (await getLivePlayer(socket.id)) || existingPlayer

        if (rejectSessionAlreadyConnected(socket, existingPlayer)) return
        if (rejectInvalidName(socket, name)) return
        if (await rejectNameUnavailable(socket, name, existingPlayer?.socketId || socket.id)) return
        if (await rejoinActiveMatch(socket, livePlayer, sessionToken)) return
        if (rejectAlreadyInMatch(socket, livePlayer)) return
        if (rejectSessionBoundToAnotherName(socket, livePlayer, name)) return

        await joinWaitingQueue(socket, sessionToken, name, livePlayer)
    })

    socket.on('leave-queue', async () => {
        await removePlayerFromQueue(socket.id)
        socket.emit('queue-left')
    })

    socket.on('leave-match', async () => {
        await abandonMatch(await getLivePlayer(socket.id), socket.id)
    })

    socket.on('submit-move', async payload => {
        if (await rejectIfMoveRateLimited(socket)) return

        const livePlayer = await getLivePlayer(socket.id)
        const game = livePlayer?.matchId ? await getGame(livePlayer.matchId) : null

        if (rejectNoActiveMatch(socket, game)) return
        if (rejectFinishedGame(socket, game)) return
        if (rejectNotYourTurn(socket, game, livePlayer)) return
        if (rejectMissingPromotionPiece(socket, game, payload)) return

        const result = applyMove(game, payload)
        if (rejectInvalidMove(socket, result)) return

        await applyResultToGameState(game, result)
    })

    socket.on('disconnect', async () => {
        await removePlayerFromQueue(socket.id)
        await handlePlayerDisconnect(await getLivePlayer(socket.id))
        await forgetSocket(socket.id)
    })
})

await connectRedis()
httpServer.listen(PORT, () => {
    console.log(`PvP server listening on http://localhost:${PORT}`)
})