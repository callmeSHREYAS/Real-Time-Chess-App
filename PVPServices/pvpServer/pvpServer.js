import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Server } from 'socket.io'
import { setupStartingPosition, Color } from '../../src/computer/engine/board.js'
import { DEFAULT_GAME_STATE } from '../../src/computer/engine/gameState.js'
import { submitMove } from './gameService.js'
import {
    closeDatabase,
    getDisconnectedUser,
    initializeDatabase,
    registerSocketPlayer,
    removeDisconnectedUser,
    removeSocketPlayer,
    replaceSocketPlayer,
    saveDisconnectedUser,
} from '../Models/database.js'
import {
    closeRedis,
    configureSocketIoAdapter,
    createMatch,
    enqueuePlayer,
    getGame,
    getPlayer,
    getPlayerBySessionToken,
    getQueueLength,
    handoffGamePlayer,
    initializeRedis,
    markGamePlayerDisconnected,
    removeGame,
    removePlayer,
    removePlayerBySessionToken,
    removeQueuedPlayer,
    setGame,
    setPlayer,
    takeQueuedPair,
} from '../Models/redis.js'

const PORT = Number(globalThis.process?.env?.PVP_PORT || 3001)
const SERVER_ID = globalThis.process?.env?.PVP_SERVER_ID || `game-${PORT}`
const GAME_SERVER_URL = globalThis.process?.env?.PVP_PUBLIC_URL || `http://localhost:${PORT}`
const GAME_SERVER_URLS = new Map(
    (globalThis.process?.env?.PVP_GAME_SERVER_URLS
        || 'game-01=http://localhost:3001,game-02=http://localhost:3002,game-03=http://localhost:3003,game-04=http://localhost:3004,game-05=http://localhost:3005')
        .split(',')
        .map(entry => {
            const separator = entry.indexOf('=')
            return [entry.slice(0, separator), entry.slice(separator + 1)]
        })
        .filter(([serverId, url]) => serverId && url),
)
const CORS_ORIGINS = (globalThis.process?.env?.PVP_CORS_ORIGINS
    || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
const NAME_PATTERN = /^.{2,20}$/u
const RECONNECT_GRACE_MS = 30_000
let socketEventQueue = Promise.resolve()
let ownerOperationQueue = Promise.resolve()

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
    throw new Error(`Invalid PvP port: ${PORT}`)
}

const httpServer = createServer()
const io = new Server(httpServer, {
    cors: {
        origin: CORS_ORIGINS,
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

function getGameServerUrl(game) {
    const url = game.ownerId === SERVER_ID ? GAME_SERVER_URL : GAME_SERVER_URLS.get(game.ownerId)
    if (!url) {
        throw new Error(`No public URL configured for authoritative server ${game.ownerId}`)
    }
    return url
}

function sendGameState(game) {
    const snapshot = getGameSnapshot(game)
    for (const player of game.players) {
        io.to(player.socketId).emit('game-state', {
            ...snapshot,
            yourColor: player.color,
            yourName: player.name,
            sessionToken: player.sessionToken,
            opponentName: game.players.find(other => other.socketId !== player.socketId)?.name || '',
            gameServerUrl: getGameServerUrl(game),
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
        if (!whitePlayer || !blackPlayer) {
            if (whitePlayer && !whitePlayer.matchId) await enqueuePlayer(whiteSocketId)
            if (blackPlayer && !blackPlayer.matchId) await enqueuePlayer(blackSocketId)
            continue
        }

        const [whiteSockets, blackSockets] = await Promise.all([
            io.in(whiteSocketId).fetchSockets(),
            io.in(blackSocketId).fetchSockets(),
        ])
        if (!whiteSockets.length || !blackSockets.length) {
            if (whiteSockets.length && !whitePlayer.matchId) await enqueuePlayer(whiteSocketId)
            if (blackSockets.length && !blackPlayer.matchId) await enqueuePlayer(blackSocketId)
            if (!whiteSockets.length) {
                await Promise.all([removePlayer(whiteSocketId), removeSocketPlayer(whiteSocketId)])
            }
            if (!blackSockets.length) {
                await Promise.all([removePlayer(blackSocketId), removeSocketPlayer(blackSocketId)])
            }
            continue
        }

        whitePlayer.sessionToken = randomUUID()
        whitePlayer.disconnectedAt = null
        blackPlayer.sessionToken = randomUUID()
        blackPlayer.disconnectedAt = null

        const game = {
            matchId: makeId('match'),
            ownerId: SERVER_ID,
            version: 0,
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

        game.players[0].matchId = game.matchId
        game.players[1].matchId = game.matchId
        try {
            await createMatch(game)
        } catch (error) {
            console.error(`Could not create match ${game.matchId} on ${SERVER_ID}:`, error)
            const currentPlayers = await Promise.all([
                getPlayer(whiteSocketId),
                getPlayer(blackSocketId),
            ])
            for (const [index, currentPlayer] of currentPlayers.entries()) {
                const socketId = index === 0 ? whiteSocketId : blackSocketId
                if (currentPlayer && !currentPlayer.matchId) await enqueuePlayer(socketId)
            }
            continue
        }
        console.log(`Created game: match=${game.matchId} owner=${SERVER_ID}`)
        sendGameState(game)
    }
}

async function endGame(game, leavingSocketId = null, reason = 'Match ended') {
    const socketIds = game.players.map(player => player.socketId).filter(Boolean)
    const allPlayersDisconnected = game.players.every(player => player.disconnectedAt != null)
    if (!allPlayersDisconnected) {
        await Promise.all(game.players.map(player => new Promise(resolve => {
            const playerReason = player.socketId === leavingSocketId
                ? 'You left the match.'
                : reason
            io.to(player.socketId).timeout(1500).emit('match-ended', {
                reason: playerReason,
            }, () => resolve())
        })))
    }

    try {
        await removeGame(game.matchId)

        await Promise.all(game.players.flatMap(player => [
            removePlayer(player.socketId),
            removeSocketPlayer(player.socketId),
            ...(player.sessionToken
                ? [
                    removePlayerBySessionToken(player.sessionToken),
                    removeDisconnectedUser(player.name, player.sessionToken),
                ]
                : []),
        ]))
    } finally {
        if (socketIds.length) {
            io.in(socketIds).disconnectSockets(true)
        }
    }
}

async function expireDisconnectedPlayer(name, sessionToken, disconnectedAt) {
    const player = await getPlayerBySessionToken(sessionToken)
    if (!player || player.disconnectedAt !== disconnectedAt) return

    const disconnectedAtMs = Date.parse(disconnectedAt)
    if (Number.isFinite(disconnectedAtMs) && Date.now() - disconnectedAtMs < RECONNECT_GRACE_MS) {
        setTimeout(() => queueSocketEvent(
            () => expireDisconnectedPlayer(name, sessionToken, disconnectedAt),
        ), disconnectedAtMs + RECONNECT_GRACE_MS - Date.now())
        return
    }

    const game = player.matchId ? await getGame(player.matchId) : null
    const gamePlayer = game?.players.find(candidate => candidate.sessionToken === sessionToken)
    if (game && gamePlayer?.disconnectedAt === disconnectedAt) {
        const result = await dispatchToOwner(game, 'end-game', {
            matchId: game.matchId,
            reason: 'Opponent did not reconnect within 30 seconds',
        })
        if (!result?.ok) {
            throw new Error(`Could not end expired match ${game.matchId}`)
        }
        return
    }

    await Promise.all([
        removeDisconnectedUser(name, sessionToken),
        removePlayerBySessionToken(sessionToken),
    ])
}

async function resumeDisconnectedPlayer(socket, name, sessionToken) {
    const disconnectedUser = await getDisconnectedUser(name)
    if (!disconnectedUser) return false

    const rejectResume = () => {
        socket.emit('queue-error', {
            reason: 'This disconnected match could not be verified. Check your username and reconnect token.',
        })
        return true
    }

    if (!sessionToken || disconnectedUser.sessionToken !== sessionToken) {
        return rejectResume()
    }

    const player = await getPlayerBySessionToken(sessionToken)
    if (
        !player
        || player.sessionToken !== sessionToken
        || player.name.toLowerCase() !== disconnectedUser.name.toLowerCase()
        || !player.matchId
        || !player.disconnectedAt
    ) {
        return rejectResume()
    }

    const game = await getGame(player.matchId)
    const gamePlayer = game?.players.find(candidate => candidate.sessionToken === sessionToken)
    if (!game || !gamePlayer || !gamePlayer.disconnectedAt) {
        return rejectResume()
    }

    const disconnectedAtMs = Date.parse(player.disconnectedAt)
    if (!Number.isFinite(disconnectedAtMs) || Date.now() - disconnectedAtMs >= RECONNECT_GRACE_MS) {
        await expireDisconnectedPlayer(name, sessionToken, player.disconnectedAt)
        return false
    }

    const registeredName = await registerSocketPlayer(socket.id, name)
    const resumedPlayer = {
        ...player,
        socketId: socket.id,
        name: registeredName,
        disconnectedAt: null,
    }
    gamePlayer.socketId = socket.id
    gamePlayer.name = registeredName
    gamePlayer.disconnectedAt = null

    await setGame(game)
    await setPlayer(resumedPlayer)
    await removeDisconnectedUser(registeredName, sessionToken)
    sendGameState(game)
    return true
}

function reject(socket, reason) {
    socket.emit('move-rejected', { reason })
}

function queueSocketEvent(operation) {
    socketEventQueue = socketEventQueue
        .then(operation)
        .catch(error => console.error('PvP socket event failed:', error))
}

function queueOwnerOperation(operation) {
    const result = ownerOperationQueue.then(operation)
    ownerOperationQueue = result.catch(error => {
        console.error(`Authoritative game queue failed on ${SERVER_ID}:`, error)
    })
    return result
}

async function processOwnerRequest(request) {
    if (request.eventName === 'end-game') {
        const game = await getGame(request.data.matchId)
        if (!game || game.ownerId !== SERVER_ID) {
            return { ok: false, reason: 'The authoritative game server is unavailable' }
        }
        await endGame(game, request.data.leavingSocketId, request.data.reason)
        return { ok: true }
    }

    if (request.eventName !== 'submit-move') return { ok: false, reason: 'Unsupported game operation' }

    const player = await getPlayer(request.data.socketId)
    const game = player?.matchId ? await getGame(player.matchId) : null
    if (!game || game.ownerId !== SERVER_ID) {
        return { ok: false, reason: 'The authoritative game server is unavailable' }
    }

    const gamePlayer = game.players.find(candidate => candidate.socketId === request.data.socketId)
    if (
        !gamePlayer
        || gamePlayer.color !== player.color
        || gamePlayer.sessionToken !== player.sessionToken
    ) {
        return { ok: false, reason: 'You are not an active player in this match' }
    }

    const result = submitMove(game, player.color, request.data.payload)
    if (!result.ok) return result

    game.version = (game.version || 0) + 1
    await setGame(game)
    console.log(`Accepted move: match=${game.matchId} owner=${SERVER_ID} version=${game.version}`)
    if (game.gameStatus === 'checkmate-white') {
        await endGame(game, null, 'Checkmate. Black wins.')
        return { ok: true }
    }
    if (game.gameStatus === 'checkmate-black') {
        await endGame(game, null, 'Checkmate. White wins.')
        return { ok: true }
    }
    if (game.gameStatus === 'stalemate') {
        await endGame(game, null, 'Stalemate. The match is a draw.')
        return { ok: true }
    }

    sendGameState(game)
    return { ok: true }
}

async function dispatchToOwner(game, eventName, data) {
    const request = {
        ownerId: game.ownerId,
        eventName,
        data,
    }

    if (request.ownerId === SERVER_ID) {
        return queueOwnerOperation(() => processOwnerRequest(request))
    }

    const responses = await io.serverSideEmitWithAck('owner-request', request)
    const ownerResponse = responses.find(response => response?.ownerId === request.ownerId)
    if (!ownerResponse) {
        throw new Error(`Authoritative game server ${request.ownerId} did not respond`)
    }

    return ownerResponse.result
}

io.on('owner-request', (request, acknowledge) => {
    if (request.ownerId !== SERVER_ID) {
        acknowledge({ ownerId: SERVER_ID, handled: false })
        return
    }

    queueOwnerOperation(() => processOwnerRequest(request)).then(
        result => acknowledge({ ownerId: SERVER_ID, handled: true, result }),
        error => {
            console.error(`Could not process owner request on ${SERVER_ID}:`, error)
            acknowledge({
                ownerId: SERVER_ID,
                handled: true,
                result: { ok: false, reason: 'The authoritative game server could not complete the move' },
            })
        },
    )
})

io.on('connection', socket => {
    console.log(`Socket connected: server=${SERVER_ID} port=${PORT} socket=${socket.id}`)

    socket.on('authenticate-game', (request, acknowledge) => queueSocketEvent(async () => {
        try {
            const { matchId, sessionToken } = request || {}
            if (typeof matchId !== 'string' || typeof sessionToken !== 'string') {
                acknowledge?.({ ok: false, reason: 'Invalid game authentication request' })
                return
            }

            const player = await getPlayerBySessionToken(sessionToken)
            const game = await getGame(matchId)
            const gamePlayer = game?.players.find(candidate => candidate.sessionToken === sessionToken)
            if (
                !player
                || player.matchId !== matchId
                || player.disconnectedAt != null
                || !game
                || game.ownerId !== SERVER_ID
                || !gamePlayer
                || gamePlayer.disconnectedAt != null
            ) {
                acknowledge?.({ ok: false, reason: 'This match could not be authenticated on this server' })
                return
            }

            await replaceSocketPlayer(player.socketId, socket.id, player.name)
            const handoff = await handoffGamePlayer(
                matchId,
                sessionToken,
                socket.id,
                SERVER_ID,
                player.socketId,
            )
            if (!handoff) {
                await replaceSocketPlayer(socket.id, player.socketId, player.name)
                acknowledge?.({ ok: false, reason: 'This match could not be authenticated on this server' })
                return
            }

            await socket.join(matchId)
            const authenticatedGamePlayer = handoff.game.players.find(
                candidate => candidate.sessionToken === sessionToken,
            )
            acknowledge?.({
                ok: true,
                snapshot: {
                    ...getGameSnapshot(handoff.game),
                    yourColor: authenticatedGamePlayer.color,
                    yourName: authenticatedGamePlayer.name,
                    sessionToken,
                    opponentName: handoff.game.players.find(
                        player => player.sessionToken !== sessionToken,
                    )?.name || '',
                    gameServerUrl: getGameServerUrl(handoff.game),
                },
            })
        } catch (error) {
            console.error(`Could not authenticate game socket on ${SERVER_ID}:`, error)
            acknowledge?.({ ok: false, reason: 'Could not authenticate the game connection' })
        }
    }))

    socket.on('join-quick-match', joinRequest => queueSocketEvent(async () => {
        const name = normalizeName(typeof joinRequest === 'string' ? joinRequest : joinRequest?.name)
        const sessionToken = typeof joinRequest === 'object' ? joinRequest?.sessionToken : null

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

            if (await resumeDisconnectedPlayer(socket, name, sessionToken)) return

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
        socket.emit ('queue-left')
    }))

    socket.on('leave match', acknowledge => queueSocketEvent(async () => {
        try {
            await removeQueuedPlayer(socket.id)
            const player = await getPlayer(socket.id)
            if (player?.matchId) {
                const game = await getGame(player.matchId)
                if (game) {
                    const result = await dispatchToOwner(game, 'end-game', {
                        matchId: game.matchId,
                        leavingSocketId: socket.id,
                        reason: 'Opponent left the match',
                    })
                    if (!result?.ok) throw new Error('Could not end the game on its authoritative server')
                }
            }

            await Promise.all([
                removePlayer(socket.id),
                removeSocketPlayer(socket.id),
            ])
            acknowledge?.({ ok: true })
        } catch (error) {
            console.error('Could not leave match:', error)
            acknowledge?.({ ok: false, reason: 'Could not leave the match' })
        }
    }))

    socket.on('submit-move', payload => queueSocketEvent(async () => {
        const player = await getPlayer(socket.id)
        const game = player?.matchId ? await getGame(player.matchId) : null

        if (!game) {
            reject(socket, 'You are not in an active match')
            return
        }

        try {
            const result = await dispatchToOwner(game, 'submit-move', {
                socketId: socket.id,
                payload,
            })
            if (!result?.ok) {
                reject(socket, result?.reason || 'The authoritative game server could not complete the move')
            }
        } catch (error) {
            console.error(`Could not route move for match ${game.matchId}:`, error)
            reject(socket, 'The authoritative game server is temporarily unavailable')
        }
    }))

    socket.on('disconnect', () => queueSocketEvent(async () => {
        await removeQueuedPlayer(socket.id)
        const player = await getPlayer(socket.id)
        if (!player) {
            await removeSocketPlayer(socket.id)
            return
        }

        if (player.matchId) {
            const game = await getGame(player.matchId)
            const gamePlayer = game?.players.find(candidate => candidate.sessionToken === player.sessionToken)
            const gameIsOver = game?.gameStatus === 'checkmate-white'
                || game?.gameStatus === 'checkmate-black'
                || game?.gameStatus === 'stalemate'

            if (game && gamePlayer && player.sessionToken && !gameIsOver) {
                const disconnectedAt = new Date().toISOString()
                player.disconnectedAt = disconnectedAt
                await setPlayer(player)
                await saveDisconnectedUser(player.name, player.sessionToken, disconnectedAt)
                const updatedGame = await markGamePlayerDisconnected(
                    game.matchId,
                    player.sessionToken,
                    disconnectedAt,
                )
                if (!updatedGame) {
                    await Promise.all([
                        removePlayer(socket.id),
                        removeSocketPlayer(socket.id),
                        removeDisconnectedUser(player.name, player.sessionToken),
                    ])
                    return
                }
                await removePlayer(socket.id, { preserveSessionToken: true })
                await removeSocketPlayer(socket.id)

                if (updatedGame.players.every(candidate => candidate.disconnectedAt != null)) {
                    const result = await dispatchToOwner(updatedGame, 'end-game', {
                        matchId: updatedGame.matchId,
                        reason: 'Both players disconnected. The match has ended.',
                    })
                    if (!result?.ok) {
                        throw new Error(`Could not end match ${updatedGame.matchId} after both players disconnected`)
                    }
                    return
                }

                setTimeout(() => queueSocketEvent(
                    () => expireDisconnectedPlayer(player.name, player.sessionToken, disconnectedAt),
                ), RECONNECT_GRACE_MS)

                const opponent = updatedGame.players.find(candidate => candidate.sessionToken !== player.sessionToken)
                if (opponent) {
                    io.to(opponent.socketId).emit('opponent-disconnected', {
                        name: player.name,
                        disconnectedAt,
                    })
                }
                return
            }

            if (game) await endGame(game, socket.id, 'Opponent disconnected')
        }

        await Promise.all([
            removePlayer(socket.id),
            removeSocketPlayer(socket.id),
        ])
    }))
})

await initializeDatabase()
await initializeRedis()
configureSocketIoAdapter(io)

httpServer.on('request', (request, response) => {
    if (request.url !== '/healthz') return
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, serverId: SERVER_ID, port: PORT }))
})

httpServer.listen(PORT, () => {
    console.log(`PvP server ready: server=${SERVER_ID} port=${PORT}`)
})

async function shutdown() {
    io.close(async () => {
        await Promise.all([closeDatabase(), closeRedis()])
        globalThis.process?.exit(0)
    })
}

globalThis.process?.on('SIGINT', shutdown)
globalThis.process?.on('SIGTERM', shutdown)
