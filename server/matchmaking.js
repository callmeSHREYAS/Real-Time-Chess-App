import { redisClient, saveGame } from './redis.js'
import { clearDisconnectTimer, getLivePlayer, getLivePlayerBySession } from './players.js'
import { sendGameState } from './pvpServer.js'
import { setupStartingPosition, Color } from '../src/computer/engine/board.js'
import { DEFAULT_GAME_STATE } from '../src/computer/engine/gameState.js'

const WAITING_QUEUE_KEY = 'chess:pvp:waiting-queue'

function makeId(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function removeSessionFromQueue(sessionToken) {
    await redisClient.lRem(WAITING_QUEUE_KEY, 0, sessionToken)
}

export async function removePlayerFromQueue(socketId) {
    const livePlayer = getLivePlayer(socketId)
    if (!livePlayer) return
    await removeSessionFromQueue(livePlayer.sessionToken)
}

export async function enqueueForMatchmaking(sessionToken) {
    await redisClient.rPush(WAITING_QUEUE_KEY, sessionToken)
}

export async function waitingQueueLength() {
    return redisClient.lLen(WAITING_QUEUE_KEY)
}

export async function pairPlayers() {
    while (true) {
        // check-and-pop has to be one atomic Lua script, not LLEN followed by
        // LPOP, because pairPlayers() may be running more than once at the
        // same time (any join triggers it). Two concurrent runs could both
        // see "two players waiting" and then race to pop - or worse, one run
        // pops the last remaining player alone and leaves them stranded.
        // Atomic execution guarantees each queued session is popped exactly
        // once, and only by a pairing that can actually complete.
        const sessions = await redisClient.eval(
            `local queueLength = redis.call('LLEN', KEYS[1])
            if queueLength < 2 then
                return {}
            end
            return redis.call('LPOP', KEYS[1], 2)`,
            { keys: [WAITING_QUEUE_KEY], arguments: [] },
        )
        if (!sessions || sessions.length < 2) return

        const [whiteSessionToken, blackSessionToken] = sessions
        const whiteLivePlayer = getLivePlayerBySession(whiteSessionToken)
        const blackLivePlayer = getLivePlayerBySession(blackSessionToken)

        // A popped token can point at a player who is no longer online on
        // this process (e.g. they disconnected right after queuing). Skip
        // them rather than starting a match with a ghost, and keep looping
        // so any remaining pairs still get matched.
        if (!whiteLivePlayer?.socketId || !blackLivePlayer?.socketId) continue
        const game = {
            matchId: makeId('match'),
            board: setupStartingPosition(),
            currentTurn: Color.White,
            gameState: { ...DEFAULT_GAME_STATE },
            enPassantSquare: null,
            gameStatus: null,
            capturedWhite: [],
            capturedBlack: [],
            // Spread copies of the live players into the record: what goes
            // to Redis must not share object identity with the in-memory
            // player, because the two are meant to diverge over time.
            players: [
                { ...whiteLivePlayer, color: Color.White },
                { ...blackLivePlayer, color: Color.Black },
            ],
        }
        console.log("players matched");
        await saveGame(game)
        whiteLivePlayer.matchId = game.matchId
        whiteLivePlayer.color = Color.White
        clearDisconnectTimer(whiteLivePlayer)
        blackLivePlayer.matchId = game.matchId
        blackLivePlayer.color = Color.Black
        clearDisconnectTimer(blackLivePlayer)
        sendGameState(game)
    }
}