import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { applyChessMove } from '../src/computer/engine/applyChessMove.js'
import { setupStartingPosition, Color, Piece } from '../src/computer/engine/board.js'
import { DEFAULT_GAME_STATE } from '../src/computer/engine/gameState.js'

const PORT = Number(globalThis.process?.env?.PVP_PORT || 3001)
const NAME_PATTERN = /^.{2,20}$/u
const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
        methods: ['GET', 'POST'],
    },
})

const waitingQueue = []
const playersBySocket = new Map()
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

function removeFromQueue(socketId) {
    const index = waitingQueue.indexOf(socketId)
    if (index !== -1) waitingQueue.splice(index, 1)
}

function pairPlayers() {
    while (waitingQueue.length >= 2) {
        const whiteSocketId = waitingQueue.shift()
        const blackSocketId = waitingQueue.shift()
        const whitePlayer = getPlayer(whiteSocketId)
        const blackPlayer = getPlayer(blackSocketId)

        if (!whitePlayer || !blackPlayer) continue

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

        gamesById.set(game.matchId, game)
        whitePlayer.matchId = game.matchId
        whitePlayer.color = Color.White
        blackPlayer.matchId = game.matchId
        blackPlayer.color = Color.Black
        sendGameState(game)
    }
}

function endGame(game, disconnectedSocketId = null) {
    gamesById.delete(game.matchId)

    for (const player of game.players) {
        const playerState = getPlayer(player.socketId)
        if (playerState) {
            playerState.matchId = null
            playerState.color = null
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

io.on('connection', socket => {
    socket.on('join-quick-match', rawName => {
        const player = getPlayer(socket.id)
        const name = normalizeName(rawName)

        if (!NAME_PATTERN.test(name)) {
            socket.emit('queue-error', { reason: 'Name must be between 2 and 20 characters' })
            return
        }

        if (!isNameAvailable(name, socket.id)) {
            socket.emit('queue-error', { reason: 'That username is already in use' })
            return
        }

        if (player?.matchId) {
            socket.emit('queue-error', { reason: 'You are already in a match' })
            return
        }

        removeFromQueue(socket.id)
        const nextPlayer = player || { socketId: socket.id, matchId: null, color: null }
        nextPlayer.name = name
        playersBySocket.set(socket.id, nextPlayer)
        waitingQueue.push(socket.id)
        socket.emit('queue-status', { position: waitingQueue.length })
        pairPlayers()
    })

    socket.on('leave-queue', () => {
        removeFromQueue(socket.id)
        socket.emit('queue-left')
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

    socket.on('disconnect', () => {
        removeFromQueue(socket.id)
        const player = getPlayer(socket.id)
        if (player?.matchId) {
            const game = gamesById.get(player.matchId)
            if (game) endGame(game, socket.id)
        }
        playersBySocket.delete(socket.id)
    })
})

httpServer.listen(PORT, () => {
    console.log(`PvP server listening on http://localhost:${PORT}`)
})
