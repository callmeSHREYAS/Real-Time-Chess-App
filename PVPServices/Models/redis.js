import { createClient } from 'redis'

const QUEUE_KEY = 'pvp:queue'
const PLAYERS_KEY = 'pvp:players'
const GAMES_KEY = 'pvp:games'

export const redis = createClient({
    url: globalThis.process?.env?.REDIS_URL || 'redis://127.0.0.1:16379',
})

redis.on('error', error => console.error('Redis client error:', error))

export async function initializeRedis() {
    await redis.connect()
    await redis.del(QUEUE_KEY, PLAYERS_KEY, GAMES_KEY)
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
    return player ? JSON.parse(player) : null
}

export async function setPlayer(player) {
    await redis.hSet(PLAYERS_KEY, player.socketId, JSON.stringify(player))
}

export async function removePlayer(socketId) {
    await redis.hDel(PLAYERS_KEY, socketId)
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
