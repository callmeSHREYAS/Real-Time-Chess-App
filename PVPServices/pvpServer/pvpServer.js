import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import { applyChessMove } from '../../src/computer/engine/applyChessMove.js'
import { setupStartingPosition, Color, Piece } from '../../src/computer/engine/board.js'
import { DEFAULT_GAME_STATE } from '../../src/computer/engine/gameState.js'
import {
    clearSocketPlayers,
    closeDatabase,
    initializeDatabase,
    registerSocketPlayer,
    removeSocketPlayer,
    removeUser,
} from '../Models/database.js'
import {
    closeRedis,
    enqueuePlayer,
    getGame,
    getPlayer,
    getQueueLength,
    initializeRedis,
    removeGame,
    removePlayer,
    removeQueuedPlayer,
    setGame,
    setPlayer,
    takeQueuedPair,
} from '../Models/redis.js'

const PORT = Number(globalThis.process?.env?.PVP_PORT || 3001)
const NAME_PATTERN = /^.{2,20}$/u
const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])
let socketEventQueue = Promise.resolve()

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
    },
})

function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeName(name) {
    return typeof name === 'string' ? name.trim() : ''
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
        io.to(player.socketId).emit('game-state', {
            ...snapshot,
            yourColor: player.color,
            yourName: player.name,
            opponentName: game.players.find(other => other.socketId !== player.socketId)?.name || '',
        })
    }
}

async function pairPlayers() {
    while (true) {
        const pair = await takeQueuedPair()
        if (!pair || pair.length < 2) return

        const [whiteSocketId, blackSocketId] = pair
        const [whitePlayer, blackPlayer] = await Promise.all([
            getPlayer(whiteSocketId),
            getPlayer(blackSocketId),
        ])
        if (!whitePlayer || !blackPlayer) continue

        whitePlayer.sessionToken = randomUUID()
        whitePlayer.disconnectedAt = null
        blackPlayer.sessionToken = randomUUID()
        blackPlayer.disconnectedAt = null

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

        whitePlayer.matchId = game.matchId
        whitePlayer.color = Color.White
        blackPlayer.matchId = game.matchId
        blackPlayer.color = Color.Black
        await Promise.all([
            setGame(game),
            setPlayer(whitePlayer),
            setPlayer(blackPlayer),
        ])
        sendGameState(game)
    }
}

async function endGame(game, disconnectedSocketId = null) {
    await removeGame(game.matchId)

    //todo remove players from PLAYERS_KEY
    for (const player of game.players) {
        const playerState = await getPlayer(player.socketId)
        if (playerState) {
            playerState.matchId = null
            playerState.color = null
            await setPlayer(playerState)
        }

        if (player.socketId !== disconnectedSocketId) {
            io.to(player.socketId).emit('match-ended', {
                reason: disconnectedSocketId ? 'Opponent disconnected' : 'Match ended',
            })
        }
    }
}

function reject(socket, reason) {
    socket.emit('move-rejected', { reason })
}

function queueSocketEvent(operation) {
    socketEventQueue = socketEventQueue
        .then(operation)
        .catch(error => console.error('PvP socket event failed:', error))
}

io.on('connection', socket => {
    socket.on('join-quick-match', rawName => queueSocketEvent(async () => {
        const name = normalizeName(rawName)

        if (!NAME_PATTERN.test(name)) {
            socket.emit('queue-error', { reason: 'Name must be between 2 and 20 characters' })
            return
        }

        try {
            const player = await getPlayer(socket.id)
            if (player?.matchId) {
                socket.emit('queue-error', { reason: 'You are already in a match' })
                return
            }

            const registeredName = await registerSocketPlayer(socket.id, name)
            await removeQueuedPlayer(socket.id)
            await setPlayer({
                socketId: socket.id,
                name: registeredName,
                matchId: null,
                color: null,
            })
            await enqueuePlayer(socket.id)
            socket.emit('queue-status', { position: await getQueueLength() })
            await pairPlayers()
        } catch (error) {
            if (error.code === 'USERNAME_IN_USE') {
                socket.emit('queue-error', { reason: 'That username is already in use' })
                return
            }
            console.error('Could not join quick match:', error)
            socket.emit('queue-error', { reason: 'Matchmaking is temporarily unavailable' })
        }
    }))

    socket.on('leave-queue', () => queueSocketEvent(async () => {
        await removeQueuedPlayer(socket.id)
        socket.emit('queue-left')
    }))

    socket.on('submit-move', payload => queueSocketEvent(async () => {
        const player = await getPlayer(socket.id)
        const game = player?.matchId ? await getGame(player.matchId) : null

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
            const capturedList = (result.capturedPiece & 0b11000) === Color.White
                ? game.capturedWhite
                : game.capturedBlack
            capturedList.push({ piece: result.capturedPiece })
        }

        await setGame(game)
        sendGameState(game)
    }))

    socket.on('disconnect', () => queueSocketEvent(async () => {
        await removeQueuedPlayer(socket.id)
        const player = await getPlayer(socket.id)
        if (player?.matchId) {
            const game = await getGame(player.matchId)
            if (game) await endGame(game, socket.id)
        }
        console.log(player.name);
        
        await Promise.all([
            removePlayer(socket.id),
            removeSocketPlayer(socket.id),
            removeUser(player.name)
        ])
    }))
})

await initializeDatabase()
await clearSocketPlayers()
await initializeRedis()

httpServer.listen(PORT, () => {
    console.log(`PvP server listening on http://localhost:${PORT}`)
})

async function shutdown() {
    io.close(async () => {
        await Promise.all([closeDatabase(), closeRedis()])
        globalThis.process?.exit(0)
    })
}

globalThis.process?.on('SIGINT', shutdown)
globalThis.process?.on('SIGTERM', shutdown)
