import { createClient } from 'redis'

const GAME_KEY_PREFIX = 'chess:pvp:game:'

// One shared connection backs every Redis read/write in the server: game
// records, the matchmaking queue, and rate-limit counters all go through
// it, so there is never more than one client to wire up.
const redisClient = createClient({
    url: globalThis.process?.env?.REDIS_URL || 'redis://localhost:6379',
})
redisClient.on('error', error => console.error('Redis client error', error))

function getGameKey(matchId) {
    return `${GAME_KEY_PREFIX}${matchId}`
}

async function getGame(matchId) {
    const serializedGame = await redisClient.get(getGameKey(matchId))
    return serializedGame ? JSON.parse(serializedGame) : null
}

async function saveGame(game) {
    await redisClient.set(getGameKey(game.matchId), JSON.stringify(game))
}

async function deleteGame(matchId) {
    await redisClient.del(getGameKey(matchId))
}

export async function connectRedis() {
    await redisClient.connect()
}

export { redisClient, getGame, saveGame, deleteGame }