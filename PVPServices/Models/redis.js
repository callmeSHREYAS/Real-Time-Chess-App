import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'

const QUEUE_KEY = 'pvp:queue'
const PLAYERS_KEY = 'pvp:players'
const SESSION_PLAYERS_KEY = 'pvp:players-by-session-token'
const GAMES_KEY = 'pvp:games'

export const redis = createClient({
    url: globalThis.process?.env?.REDIS_URL || 'redis://127.0.0.1:16379',
})

redis.on('error', error => console.error('Redis client error:', error))

let socketPubClient
let socketSubClient

export async function initializeRedis() {
    await redis.connect()
    socketPubClient = redis.duplicate()
    socketSubClient = redis.duplicate()
    socketPubClient.on('error', error => console.error('Redis Socket.IO publisher error:', error))
    socketSubClient.on('error', error => console.error('Redis Socket.IO subscriber error:', error))
    await Promise.all([socketPubClient.connect(), socketSubClient.connect()])
}

export function configureSocketIoAdapter(io) {
    if (!socketPubClient?.isReady || !socketSubClient?.isReady) {
        throw new Error('Redis Socket.IO adapter clients are not connected')
    }

    io.adapter(createAdapter(socketPubClient, socketSubClient))
}

export async function enqueuePlayer(socketId) {
    await redis.eval(
        `redis.call('LREM', KEYS[1], 0, ARGV[1])
         redis.call('RPUSH', KEYS[1], ARGV[1])
         return 1`,
        { keys: [QUEUE_KEY], arguments: [socketId] },
    )
}

export async function removeQueuedPlayer(socketId) {
    await redis.lRem(QUEUE_KEY, 0, socketId)
}

export async function getQueueLength() {
    return redis.lLen(QUEUE_KEY)
}

export async function takeQueuedPair() {
    const sockets = await redis.eval(
        `if redis.call('LLEN', KEYS[1]) < 2 then return {} end
         return { redis.call('LPOP', KEYS[1]), redis.call('LPOP', KEYS[1]) }`,
        { keys: [QUEUE_KEY], arguments: [] },
    )
    return sockets
}

export async function getPlayer(socketId) {
    const player = await redis.hGet(PLAYERS_KEY, socketId)
    return player ? deserializePlayer(player) : null
}

export async function getPlayerBySessionToken(sessionToken) {
    const player = await redis.hGet(SESSION_PLAYERS_KEY, sessionToken)
    return player ? deserializePlayer(player) : null
}

export async function setPlayer(player) {
    const previousPlayer = await getPlayer(player.socketId)
    if (
        previousPlayer?.sessionToken
        && previousPlayer.sessionToken !== player.sessionToken
    ) {
        await redis.hDel(SESSION_PLAYERS_KEY, previousPlayer.sessionToken)
    }

    const serializedPlayer = serializePlayer(player)
    await redis.hSet(PLAYERS_KEY, player.socketId, serializedPlayer)
    if (player.sessionToken) {
        await redis.hSet(SESSION_PLAYERS_KEY, player.sessionToken, serializedPlayer)
    }
}

export async function createMatch(game) {
    const [whitePlayer, blackPlayer] = game.players
    const created = await redis.eval(
        `local white = redis.call('HGET', KEYS[2], ARGV[3])
         local black = redis.call('HGET', KEYS[2], ARGV[5])
         if not white or not black then return 0 end
         local whitePlayer = cjson.decode(white)
         local blackPlayer = cjson.decode(black)
         if (whitePlayer.matchId ~= nil and whitePlayer.matchId ~= cjson.null)
             or (blackPlayer.matchId ~= nil and blackPlayer.matchId ~= cjson.null) then return 0 end
         if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 0 end
         redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
         redis.call('HSET', KEYS[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6])
         redis.call('HSET', KEYS[3], ARGV[7], ARGV[4], ARGV[8], ARGV[6])
         return 1`,
        {
            keys: [GAMES_KEY, PLAYERS_KEY, SESSION_PLAYERS_KEY],
            arguments: [
                game.matchId,
                JSON.stringify(game),
                whitePlayer.socketId,
                serializePlayer(whitePlayer),
                blackPlayer.socketId,
                serializePlayer(blackPlayer),
                whitePlayer.sessionToken,
                blackPlayer.sessionToken,
            ],
        },
    )

    if (created !== 1) {
        throw new Error(`Could not atomically create match ${game.matchId}`)
    }
}

export async function removePlayer(socketId, { preserveSessionToken = false } = {}) {
    const player = await getPlayer(socketId)
    const removals = [redis.hDel(PLAYERS_KEY, socketId)]
    if (player?.sessionToken && !preserveSessionToken) {
        removals.push(redis.hDel(SESSION_PLAYERS_KEY, player.sessionToken))
    }
    await Promise.all(removals)
}

export async function removePlayerBySessionToken(sessionToken) {
    const player = await getPlayerBySessionToken(sessionToken)
    const removals = [redis.hDel(SESSION_PLAYERS_KEY, sessionToken)]
    if (player?.socketId) {
        removals.push(redis.hDel(PLAYERS_KEY, player.socketId))
    }
    await Promise.all(removals)
}

function serializePlayer({ socketId, ...player }) {
    return JSON.stringify({ ...player, socket_id: socketId })
}

function deserializePlayer(serializedPlayer) {
    const { socket_id: socketId, ...player } = JSON.parse(serializedPlayer)
    return { ...player, socketId: socketId ?? player.socketId }
}

export async function getGame(matchId) {
    const game = await redis.hGet(GAMES_KEY, matchId)
    return game ? JSON.parse(game) : null
}

export async function setGame(game) {
    await redis.hSet(GAMES_KEY, game.matchId, JSON.stringify(game))
}

export async function markGamePlayerDisconnected(matchId, sessionToken, disconnectedAt) {
    const serializedGame = await redis.eval(
        `local serialized = redis.call('HGET', KEYS[1], ARGV[1])
         if not serialized then return false end
         local game = cjson.decode(serialized)
         for _, player in ipairs(game.players) do
             if player.sessionToken == ARGV[2] then
                 player.disconnectedAt = ARGV[3]
                 redis.call('HSET', KEYS[1], ARGV[1], cjson.encode(game))
                 return cjson.encode(game)
             end
         end
         return false`,
        { keys: [GAMES_KEY], arguments: [matchId, sessionToken, disconnectedAt] },
    )
    return serializedGame ? JSON.parse(serializedGame) : null
}

export async function removeGame(matchId) {
    await redis.hDel(GAMES_KEY, matchId)
}

export async function closeRedis() {
    await Promise.all([
        redis.isOpen ? redis.quit() : Promise.resolve(),
        socketPubClient?.isOpen ? socketPubClient.quit() : Promise.resolve(),
        socketSubClient?.isOpen ? socketSubClient.quit() : Promise.resolve(),
    ])
}
