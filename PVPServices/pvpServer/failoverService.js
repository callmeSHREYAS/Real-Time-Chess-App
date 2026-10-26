import { removeDisconnectedUser, replaceSocketPlayer } from '../Models/database.js'
import {
    claimFailedGame,
    getGame,
    getPlayer,
    getPlayerBySessionToken,
    replaceQueuedPlayer,
} from '../Models/redis.js'

const RECONNECT_GRACE_MS = 30_000

export async function recoverQueuedPlayer(previousSocketId, socketId) {
    const player = await replaceQueuedPlayer(previousSocketId, socketId)
    if (!player) return null

    await replaceSocketPlayer(previousSocketId, socketId, player.name)
    return player
}

export async function recoverMatchedPlayer(previousSocketId, name) {
    const player = await getPlayer(previousSocketId)
    if (
        !player
        || player.name.toLowerCase() !== name.toLowerCase()
        || !player.matchId
    ) {
        return null
    }

    const game = await getGame(player.matchId)
    const gamePlayer = game?.players.find(
        candidate => candidate.sessionToken === player.sessionToken,
    )
    if (!game || !gamePlayer) return null

    for (const disconnectedAt of [player.disconnectedAt, gamePlayer.disconnectedAt]) {
        if (disconnectedAt == null) continue
        const disconnectedAtMs = Date.parse(disconnectedAt)
        if (
            !Number.isFinite(disconnectedAtMs)
            || Date.now() - disconnectedAtMs >= RECONNECT_GRACE_MS
        ) {
            return null
        }
    }

    return { player, game, gamePlayer }
}

export async function recoverGameOwnership({
    matchId,
    sessionToken,
    socketId,
    ownerId,
    failedOwnerId,
    previousSocketId,
}) {
    const [player, game] = await Promise.all([
        getPlayerBySessionToken(sessionToken),
        getGame(matchId),
    ])
    if (!player || player.matchId !== matchId || !game) return null

    const gamePlayer = game.players.find(candidate => candidate.sessionToken === sessionToken)
    if (!gamePlayer) return null

    for (const disconnectedAt of [player.disconnectedAt, gamePlayer.disconnectedAt]) {
        if (disconnectedAt == null) continue
        const disconnectedAtMs = Date.parse(disconnectedAt)
        if (
            !Number.isFinite(disconnectedAtMs)
            || Date.now() - disconnectedAtMs >= RECONNECT_GRACE_MS
        ) {
            return null
        }
    }

    const recovery = await claimFailedGame(
        matchId,
        sessionToken,
        socketId,
        ownerId,
        failedOwnerId,
        previousSocketId,
    )
    if (!recovery) return null
    if (!recovery.claimed) return recovery

    await replaceSocketPlayer(
        recovery.previousSocketId,
        socketId,
        recovery.player.name,
    )
    await removeDisconnectedUser(recovery.player.name, sessionToken)
    return recovery
}
