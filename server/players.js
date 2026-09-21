import { io } from './pvpServer.js'
import { deleteGame, getGame } from './redis.js'

export const RECONNECT_GRACE_PERIOD_MS = 30_000

// Live players are per-process state (see the design note at the top of
// pvpServer.js): this process's memory only knows about players connected
// to THIS server. The socket map pairs a socket id with its live player,
// and the session map is the same set of players keyed by an opaque token
// the client owns, so a reconnect can find its player again.
// {
//     socketId,
//     sessionToken,
//     name,
//     matchId,        // links to the game record in Redis, null while idle
//     color,          // assigned only once a match is made
//     disconnectedAt, // set at disconnect, cleared on reconnect
//     disconnectTimer
// }
export const playersBySocket = new Map()
export const playersBySession = new Map()

// Names are trimmed exactly once at the join boundary; every later check
// (availability, session binding) compares the trimmed form.
export function normalizeName(name) {
    return typeof name === 'string' ? name.trim() : ''
}

// Two connected players must not share a name, or a match could pair up
// two people who look identical to the client.
export function isNameAvailable(name, socketId) {
    for (const candidate of playersBySocket.values()) {
        if (candidate.socketId !== socketId && candidate.name.toLowerCase() === name.toLowerCase()) {
            return false
        }
    }

    return true
}

export function getLivePlayer(socketId) {
    return playersBySocket.get(socketId) || null
}

export function getLivePlayerBySession(sessionToken) {
    return playersBySession.get(sessionToken) || null
}

export function makeNewPlayer(sessionToken) {
    return { sessionToken, matchId: null, color: null }
}

export function rememberSocketForPlayer(socketId, livePlayer) {
    playersBySocket.set(socketId, livePlayer)
}

export function rememberSessionForPlayer(sessionToken, livePlayer) {
    playersBySession.set(sessionToken, livePlayer)
}

export function forgetSession(sessionToken) {
    playersBySession.delete(sessionToken)
}

export function forgetSocket(socketId) {
    playersBySocket.delete(socketId)
}

// disconnectTimer and disconnectedAt always change together: either the
// player is fully online (no timer, disconnectedAt null) or a reconnect
// grace period is ticking.
export function clearDisconnectTimer(livePlayer) {
    if (livePlayer.disconnectTimer) clearTimeout(livePlayer.disconnectTimer)
    livePlayer.disconnectTimer = null
    livePlayer.disconnectedAt = null
}

// Nothing captured at disconnect time is trusted when the timer finally
// fires: the player may have reconnected (which clears disconnectedAt and
// replaces the socket id), the game may have ended on another server, or
// this timer may be the stale leftover of an earlier disconnect that was
// superseded by clearDisconnectTimer. So the callback re-reads the freshest
// live player and game record before deciding to end the game.
export function scheduleDisconnectExpiry(livePlayer, gameRecord) {
    clearDisconnectTimer(livePlayer)
    livePlayer.disconnectedAt = Date.now()
    const sessionToken = livePlayer.sessionToken
    const matchId = gameRecord.matchId
    livePlayer.disconnectTimer = setTimeout(async () => {
        try {
            const currentLivePlayer = getLivePlayerBySession(sessionToken)
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
}

// Tears down an active match: drops the Redis record, then for each
// participant resets their live state so they can queue again and tells
// the online opponent. The live player and the game-player record are
// deliberately different objects - never mutate one expecting the other
// to change.
export async function endGame(gameRecord, disconnectedSessionToken = null) {
    await deleteGame(gameRecord.matchId)

    for (const gamePlayerRecord of gameRecord.players) {
        const livePlayer = getLivePlayerBySession(gamePlayerRecord.sessionToken)
        if (livePlayer) {
            clearDisconnectTimer(livePlayer)
            livePlayer.matchId = null
            livePlayer.color = null
            forgetSession(livePlayer.sessionToken)
            if (livePlayer.socketId) forgetSocket(livePlayer.socketId)
        }

        if (gamePlayerRecord.socketId && gamePlayerRecord.sessionToken !== disconnectedSessionToken) {
            io.to(gamePlayerRecord.socketId).emit('match-ended', {
                reason: disconnectedSessionToken ? 'Opponent disconnected' : 'Match ended',
            })
        }
    }
}