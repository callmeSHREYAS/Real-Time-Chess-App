import { io } from './pvpServer.js'
import { redisClient, deleteGame, getGame } from './redis.js'

export const RECONNECT_GRACE_PERIOD_MS = 30_000

const PLAYER_SESSION_KEY_PREFIX = 'chess:pvp:player-session:'
const PLAYER_SOCKET_KEY_PREFIX = 'chess:pvp:player-socket:'

// Live players are shared state (no longer per-process): every server that
// touches the app reads and writes the same Redis records, so a reconnect
// that lands on a different process can still find its player and match.
// The socket key mirrors the same record under the connected socket's id,
// so a socket lookup is a single GET just like the old in-memory map.
// Only the reconnect-grace timers stay in process memory: a setTimeout
// handle cannot survive a trip through Redis.
// Record shape stored under both keys:
// {
//     socketId,
//     sessionToken,
//     name,
//     matchId,        // links to the game record in Redis, null while idle
//     color,          // assigned only once a match is made
//     disconnectedAt, // set at disconnect, cleared on reconnect
// }
const disconnectTimers = new Map() // sessionToken -> reconnect-grace setTimeout handle

function playerSessionKey(sessionToken) {
    return `${PLAYER_SESSION_KEY_PREFIX}${sessionToken}`
}

function playerSocketKey(socketId) {
    return `${PLAYER_SOCKET_KEY_PREFIX}${socketId}`
}

// The reconnect-grace timer is a per-process handle kept in the
// disconnectTimers map, never on the record itself.
function serializeLivePlayer(livePlayer) {
    return JSON.stringify(livePlayer)
}

// Write the record everywhere it is indexed: the session key always, plus
// the socket key whenever the player is attached to a socket. Keeping both
// copies identical mirrors the old scheme where the two maps held the very
// same object.
async function saveLivePlayer(livePlayer) {
    const serialized = serializeLivePlayer(livePlayer)
    if (livePlayer.sessionToken) await redisClient.set(playerSessionKey(livePlayer.sessionToken), serialized)
    if (livePlayer.socketId) await redisClient.set(playerSocketKey(livePlayer.socketId), serialized)
}

// Names are trimmed exactly once at the join boundary; every later check
// (availability, session binding) compares the trimmed form.
export function normalizeName(name) {
    return typeof name === 'string' ? name.trim() : ''
}

// Two connected players must not share a name, or a match could pair up
// two people who look identical to the client. Availability is judged by
// the socket-key records: a player who disconnected is no longer visible
// (their socket key is deleted), even while their reconnect grace period
// is still ticking, exactly as the old socket map behaved.
export async function isNameAvailable(name, socketId) {
    for await (const key of redisClient.scanIterator({ MATCH: `${PLAYER_SOCKET_KEY_PREFIX}*`, COUNT: 100 })) {
        const serialized = await redisClient.get(key)
        if (!serialized) continue
        const candidate = JSON.parse(serialized)
        if (candidate.socketId !== socketId && candidate.name.toLowerCase() === name.toLowerCase()) {
            return false
        }
    }

    return true
}

export async function getLivePlayer(socketId) {
    const serialized = await redisClient.get(playerSocketKey(socketId))
    return serialized ? JSON.parse(serialized) : null
}

export async function getLivePlayerBySession(sessionToken) {
    const serialized = await redisClient.get(playerSessionKey(sessionToken))
    return serialized ? JSON.parse(serialized) : null
}

export function makeNewPlayer(sessionToken) {
    return { sessionToken, matchId: null, color: null }
}

export async function rememberSocketForPlayer(socketId, livePlayer) {
    await saveLivePlayer(livePlayer)
}

export async function rememberSessionForPlayer(sessionToken, livePlayer) {
    await saveLivePlayer(livePlayer)
}

export async function forgetSession(sessionToken) {
    await redisClient.del(playerSessionKey(sessionToken))
}

export async function forgetSocket(socketId) {
    await redisClient.del(playerSocketKey(socketId))
}

// The grace timer is stored in the per-process map (keyed by session token)
// rather than on the record, because only the process that started it can
// ever clear it. disconnectedAt and the timer always change together: either
// the player is fully online (no timer, disconnectedAt null) or a reconnect
// grace period is ticking.
export async function clearDisconnectTimer(livePlayer) {
    const timer = disconnectTimers.get(livePlayer.sessionToken)
    if (timer) clearTimeout(timer)
    disconnectTimers.delete(livePlayer.sessionToken)
    livePlayer.disconnectedAt = null
    await saveLivePlayer(livePlayer)
}

// Nothing captured at disconnect time is trusted when the timer finally
// fires: the player may have reconnected (which clears disconnectedAt and
// replaces the socket id), the game may have ended on another server, or
// this timer may be the stale leftover of an earlier disconnect that was
// superseded by clearDisconnectTimer. So the callback re-reads the freshest
// live player and game record before deciding to end the game.
export async function scheduleDisconnectExpiry(livePlayer, gameRecord) {
    await clearDisconnectTimer(livePlayer)
    livePlayer.disconnectedAt = Date.now()
    const sessionToken = livePlayer.sessionToken
    const matchId = gameRecord.matchId
    const timer = setTimeout(async () => {
        try {
            const currentLivePlayer = await getLivePlayerBySession(sessionToken)
            const currentGame = await getGame(matchId)
            const currentGamePlayerRecord = currentGame?.players.find(record => record.sessionToken === sessionToken)

            if (
                currentLivePlayer?.disconnectedAt &&
                currentGamePlayerRecord?.socketId === null &&
                currentGamePlayerRecord.disconnectedAt &&
                Date.now() - currentLivePlayer.disconnectedAt >= RECONNECT_GRACE_PERIOD_MS
            ) {
                await endGame(currentGame, sessionToken)
            }
        } catch (error) {
            console.error('Failed to expire disconnected game', error)
        }
    }, RECONNECT_GRACE_PERIOD_MS)
    disconnectTimers.set(sessionToken, timer)
    await saveLivePlayer(livePlayer)
}

// Tears down an active match: drops the Redis record, then for each
// participant resets their live state so they can queue again and tells
// the online opponent. The live player and the game-player record are
// deliberately different objects - never mutate one expecting the other
// to change.
export async function endGame(gameRecord, disconnectedSessionToken = null) {
    await deleteGame(gameRecord.matchId)

    for (const gamePlayerRecord of gameRecord.players) {
        const livePlayer = await getLivePlayerBySession(gamePlayerRecord.sessionToken)
        if (livePlayer) {
            await clearDisconnectTimer(livePlayer)
            livePlayer.matchId = null
            livePlayer.color = null
            await forgetSession(livePlayer.sessionToken)
            if (livePlayer.socketId) await forgetSocket(livePlayer.socketId)
        }

        if (gamePlayerRecord.socketId && gamePlayerRecord.sessionToken !== disconnectedSessionToken) {
            io.to(gamePlayerRecord.socketId).emit('match-ended', {
                reason: disconnectedSessionToken ? 'Opponent disconnected' : 'Match ended',
            })
        }
    }
}