import { createClient } from 'redis'

const QUEUE_KEY = 'pvp:queue'
const PLAYERS_KEY = 'pvp:players'
const SESSION_PLAYERS_KEY = 'pvp:players-by-session-token'
const GAMES_KEY = 'pvp:games'

export const redis = createClient({
    url: globalThis.process?.env?.REDIS_URL || 'redis://127.0.0.1:16379',
})

redis.on('error', error => console.error('Redis client error:', error))

export async function initializeRedis() {
    await redis.connect()
    await redis.del(QUEUE_KEY, PLAYERS_KEY, SESSION_PLAYERS_KEY, GAMES_KEY)
}

export async function enqueuePlayer(socketId) {
    await redis.rPush(QUEUE_KEY, socketId)
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

export async function removeGame(matchId) {
    await redis.hDel(GAMES_KEY, matchId)
}

export async function closeRedis() {
    if (redis.isOpen) await redis.quit()
}
