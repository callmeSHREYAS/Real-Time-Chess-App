import { createServer } from 'node:http'
import { createClient } from 'redis'
import { Server } from 'socket.io'
import { applyChessMove } from '../src/computer/engine/applyChessMove.js'
import { setupStartingPosition, Color, Piece } from '../src/computer/engine/board.js'
import { DEFAULT_GAME_STATE } from '../src/computer/engine/gameState.js'

const PORT = Number(globalThis.process?.env?.PVP_PORT || 3001)
const NAME_PATTERN = /^.{2,20}$/u
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/
const RECONNECT_GRACE_PERIOD_MS = 30_000
const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])
const WAITING_QUEUE_KEY = 'chess:pvp:waiting-queue'

const httpServer = createServer()
const redisClient = createClient({
    url: globalThis.process?.env?.REDIS_URL || 'redis://localhost:6379',
})
redisClient.on('error', error => console.error('Redis client error', error))

const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
    },
})

const playersBySocket = new Map()
const playersBySession = new Map()
// {
//     socketId,
//     sessionToken,
//     name,
//     matchId,
//     color,
//     disconnectedAt,
//     disconnectTimer
// }
const gamesById = new Map()

function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeName(name) {
    return typeof name === 'string' ? name.trim() : ''
}

function isNameAvailable(name, socketId) {
    for (const player of playersBySocket.values()) {
        if (player.socketId !== socketId && player.name.toLowerCase() === name.toLowerCase()) {
            return false
        }
    }

    return true
}

function getPlayer(socketId) {
    return playersBySocket.get(socketId) || null
}

function getPlayerBySession(sessionToken) {
    return playersBySession.get(sessionToken) || null
}

function getGameSnapshot(game) {
    return {
        matchId: game.matchId,
        board: game.board,
        currentTurn: game.currentTurn,
        gameState: game.gameState,
        enPassantSquare: game.enPassantSquare,
        gameStatus: game.gameStatus,
        capturedWhite: game.capturedWhite,
        capturedBlack: game.capturedBlack,
        players: game.players.map(({ name, color }) => ({ name, color })),
    }
}

function sendGameState(game) {
    const snapshot = getGameSnapshot(game)
    for (const player of game.players) {
        if (!player.socketId) continue
        io.to(player.socketId).emit('game-state', {
            ...snapshot,
            yourColor: player.color,
            yourName: player.name,
            opponentName: game.players.find(other => other.socketId !== player.socketId)?.name || '',
        })
    }
}

async function removeFromQueue(socketId) {
    const player = getPlayer(socketId)
    if (!player) return
    await removeSessionFromQueue(player.sessionToken)
}

async function removeSessionFromQueue(sessionToken) {
    await redisClient.lRem(WAITING_QUEUE_KEY, 0, sessionToken)
}

function clearDisconnectTimer(player) {
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer)
    player.disconnectTimer = null
    player.disconnectedAt = null
}

function updateGamePlayer(game, sessionToken, updates) {
    const gamePlayer = game.players.find(player => player.sessionToken === sessionToken)
    if (gamePlayer) Object.assign(gamePlayer, updates)
    return gamePlayer
}

function notifyOpponent(game, sessionToken, event, payload) {
    for (const player of game.players) {
        if (player.sessionToken !== sessionToken && player.socketId) {
            io.to(player.socketId).emit(event, payload)
        }
    }
}

async function pairPlayers() {
    while (true) {
        const sessions = await redisClient.eval(
            `local queueLength = redis.call('LLEN', KEYS[1])
            if queueLength < 2 then
                return {}
            end
            return redis.call('LPOP', KEYS[1], 2)`,
            { keys: [WAITING_QUEUE_KEY], arguments: [] },
        )
        if (!sessions || sessions.length < 2) return

        const [whiteSessionToken, blackSessionToken] = sessions
        const whitePlayer = getPlayerBySession(whiteSessionToken)
        const blackPlayer = getPlayerBySession(blackSessionToken)

        if (!whitePlayer?.socketId || !blackPlayer?.socketId) continue
        const game = {
            matchId: makeId('match'),
            board: setupStartingPosition(),
            currentTurn: Color.White,
            gameState: { ...DEFAULT_GAME_STATE },
            enPassantSquare: null,
            gameStatus: null,
            capturedWhite: [],
            capturedBlack: [],
            players: [
                { ...whitePlayer, color: Color.White },
                { ...blackPlayer, color: Color.Black },
            ],
        }
        console.log("players matched");
        

        gamesById.set(game.matchId, game)
        whitePlayer.matchId = game.matchId
        whitePlayer.color = Color.White
        clearDisconnectTimer(whitePlayer)
        blackPlayer.matchId = game.matchId
        blackPlayer.color = Color.Black
        clearDisconnectTimer(blackPlayer)
        sendGameState(game)
    }
}

function endGame(game, disconnectedSessionToken = null) {
    gamesById.delete(game.matchId)

    for (const player of game.players) {
        const playerState = getPlayerBySession(player.sessionToken)
        if (playerState) {
            clearDisconnectTimer(playerState)
            playerState.matchId = null
            playerState.color = null
            playersBySession.delete(playerState.sessionToken)
            if (playerState.socketId) playersBySocket.delete(playerState.socketId)
        }

        if (player.socketId && player.sessionToken !== disconnectedSessionToken) {
            io.to(player.socketId).emit('match-ended', {
                reason: disconnectedSessionToken ? 'Opponent disconnected' : 'Match ended',
            })
        }
    }
}

function scheduleDisconnectExpiry(player, game) {
    clearDisconnectTimer(player)
    player.disconnectedAt = Date.now()
    player.disconnectTimer = setTimeout(() => {
        if (player.disconnectedAt && Date.now() - player.disconnectedAt >= RECONNECT_GRACE_PERIOD_MS) {
            endGame(game, player.sessionToken)
        }
    }, RECONNECT_GRACE_PERIOD_MS)
}

function reject(socket, reason) {
    socket.emit('move-rejected', { reason })
}

io.on('connection', socket => {
    socket.on('join-quick-match', async payload => {
        const rawName = typeof payload === 'string' ? payload : payload?.name
        const sessionToken = typeof payload === 'string' ? null : payload?.sessionToken
        const name = normalizeName(rawName)

        if (typeof sessionToken !== 'string' || !SESSION_TOKEN_PATTERN.test(sessionToken)) {
            socket.emit('queue-error', { reason: 'Invalid session token' })
            return
        }

        const existingPlayer = getPlayerBySession(sessionToken)
        const player = getPlayer(socket.id) || existingPlayer

        if (existingPlayer && existingPlayer.socketId && existingPlayer.socketId !== socket.id) {
            socket.emit('queue-error', { reason: 'This session is already connected' })
            return
        }

        if (!NAME_PATTERN.test(name)) {
            socket.emit('queue-error', { reason: 'Name must be between 2 and 20 characters' })
            return
        }

        if (!isNameAvailable(name, existingPlayer?.socketId || socket.id)) {
            socket.emit('queue-error', { reason: 'That username is already in use' })
            return
        }

        if (player?.matchId && player.disconnectedAt) {
            const game = gamesById.get(player.matchId)
            if (!game) {
                socket.emit('queue-error', { reason: 'That match is no longer available' })
                return
            }

            clearDisconnectTimer(player)
            player.socketId = socket.id
            playersBySocket.set(socket.id, player)
            updateGamePlayer(game, sessionToken, { socketId: socket.id })
            socket.emit('reconnected', { matchId: game.matchId })
            sendGameState(game)
            notifyOpponent(game, sessionToken, 'player-reconnected', { name: player.name })
            return
        }

        if (player?.matchId) {
            socket.emit('queue-error', { reason: 'You are already in a match' })
            return
        }

        if (player?.sessionToken && player.name !== name) {
            socket.emit('queue-error', { reason: 'This session belongs to another username' })
            return
        }

        await removeFromQueue(socket.id)
        const nextPlayer = player || { sessionToken, matchId: null, color: null }
        nextPlayer.socketId = socket.id
        nextPlayer.name = name
        playersBySocket.set(socket.id, nextPlayer)
        playersBySession.set(sessionToken, nextPlayer)
        clearDisconnectTimer(nextPlayer)
        console.log('player pushed in waiting queue');
        await redisClient.rPush(WAITING_QUEUE_KEY, sessionToken)
        socket.emit('queue-status', { position: await redisClient.lLen(WAITING_QUEUE_KEY) })
        await pairPlayers()
    })

    socket.on('leave-queue', async () => {
        await removeFromQueue(socket.id)
        socket.emit('queue-left')
    })

    socket.on('leave-match', async () => {
        const player = getPlayer(socket.id)
        const game = player?.matchId ? gamesById.get(player.matchId) : null
        if (game) endGame(game)
        else if (player) {
            await removeSessionFromQueue(player.sessionToken)
            playersBySession.delete(player.sessionToken)
            playersBySocket.delete(socket.id)
        }
    })

    socket.on('submit-move', payload => {
        const player = getPlayer(socket.id)
        const game = player?.matchId ? gamesById.get(player.matchId) : null

        if (!game) {
            reject(socket, 'You are not in an active match')
            return
        }

        if (game.gameStatus === 'checkmate-white' || game.gameStatus === 'checkmate-black' || game.gameStatus === 'stalemate') {
            reject(socket, 'The game is already over')
            return
        }

        if (game.currentTurn !== player.color) {
            reject(socket, 'It is not your turn')
            return
        }

        const fromIdx = Number(payload?.fromIdx)
        const toIdx = Number(payload?.toIdx)
        const movingPiece = game.board[fromIdx]
        const reachesPromotionRank = movingPiece && (movingPiece & 0b00111) === Piece.Pawn && (toIdx < 8 || toIdx >= 56)
        const promotionType = payload?.promotionType ?? null

        if (reachesPromotionRank && !PROMOTION_TYPES.has(promotionType)) {
            reject(socket, 'Choose a promotion piece')
            return
        }

        const result = applyChessMove({
            board: game.board,
            currentTurn: game.currentTurn,
            fromIdx,
            toIdx,
            gameState: game.gameState,
            enPassantSquare: game.enPassantSquare,
            promotionType,
        })

        if (!result.ok) {
            reject(socket, result.reason)
            return
        }

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

        sendGameState(game)
    })

    socket.on('disconnect', async () => {
        await removeFromQueue(socket.id)
        const player = getPlayer(socket.id)
        if (player?.matchId) {
            const game = gamesById.get(player.matchId)
            if (game) {
                player.socketId = null
                updateGamePlayer(game, player.sessionToken, { socketId: null })
                scheduleDisconnectExpiry(player, game)
                console.log("player-disconnected");
                
                notifyOpponent(game, player.sessionToken, 'player-disconnected', {
                    name: player.name,
                    gracePeriodSeconds: RECONNECT_GRACE_PERIOD_MS / 1000,
                })
            }
        }
        playersBySocket.delete(socket.id)
    })
})

await redisClient.connect()
httpServer.listen(PORT, () => {
    console.log(`PvP server listening on http://localhost:${PORT}`)
})
