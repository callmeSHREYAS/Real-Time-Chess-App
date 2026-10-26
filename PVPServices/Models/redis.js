import { createClient } from 'redis'
import { createAdapter } from '@socket.io/redis-adapter'

const QUEUE_KEY = 'pvp:queue'
const PLAYERS_KEY = 'pvp:players'
const SESSION_PLAYERS_KEY = 'pvp:players-by-session-token'
const GAMES_KEY = 'pvp:games'
const SERVER_COUNTER_KEY = 'pvp:game-server-selection'
const HANDOFF_TOKEN_PREFIX = 'pvp:handoff:'

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

export async function replaceQueuedPlayer(previousSocketId, socketId) {
    const serializedPlayer = await redis.eval(
        `local serialized = redis.call('HGET', KEYS[2], ARGV[1])
         if not serialized then return false end
         local player = cjson.decode(serialized)
         if player.matchId ~= nil and player.matchId ~= cjson.null then return false end
         local previousId = player.socket_id or player.socketId
         if previousId ~= ARGV[1] and previousId ~= ARGV[2] then return false end

         local queued = redis.call('LRANGE', KEYS[1], 0, -1)
         local updated = {}
         local replaced = false
         for _, queuedId in ipairs(queued) do
             if queuedId == ARGV[1] then
                 if not replaced then
                     table.insert(updated, ARGV[2])
                     replaced = true
                 end
             elseif queuedId ~= ARGV[2] then
                 table.insert(updated, queuedId)
             end
         end
         if not replaced then table.insert(updated, ARGV[2]) end

         redis.call('DEL', KEYS[1])
         for _, queuedId in ipairs(updated) do
             redis.call('RPUSH', KEYS[1], queuedId)
         end
         player.socket_id = ARGV[2]
         player.socketId = nil
         redis.call('HDEL', KEYS[2], ARGV[1])
         redis.call('HSET', KEYS[2], ARGV[2], cjson.encode(player))
         return cjson.encode(player)`,
        { keys: [QUEUE_KEY, PLAYERS_KEY], arguments: [previousSocketId, socketId] },
    )
    return serializedPlayer ? deserializePlayer(serializedPlayer) : null
}

export async function removeQueuedPlayer(socketId) {
    await redis.lRem(QUEUE_KEY, 0, socketId)
}

export async function getQueueLength() {
    return redis.lLen(QUEUE_KEY)
}

export async function heartbeatGameServer(serverId) {
    await redis.set(`pvp:server-heartbeat:${serverId}`, '1', { EX: 15 })
}

export async function selectGameServer(servers) {
    if (!servers.length) throw new Error('No PvP game servers are configured')

    const heartbeats = await redis.mGet(
        servers.map(server => `pvp:server-heartbeat:${server.id}`),
    )
    const availableServers = servers.filter((_, index) => heartbeats[index] !== null)
    if (!availableServers.length) throw new Error('No PvP game servers are available')

    const selection = await redis.incr(SERVER_COUNTER_KEY)
    return availableServers[(selection - 1) % availableServers.length]
}

export async function createHandoffToken(token, credential) {
    await redis.set(`${HANDOFF_TOKEN_PREFIX}${token}`, JSON.stringify(credential), { EX: 60 })
}

export async function consumeHandoffToken(token, matchId, ownerId) {
    const serializedCredential = await redis.eval(
        `local credential = redis.call('GET', KEYS[1])
         if not credential then return false end
         local decoded = cjson.decode(credential)
         if decoded.matchId ~= ARGV[1] or decoded.ownerId ~= ARGV[2] then return false end
         redis.call('DEL', KEYS[1])
         return credential`,
        {
            keys: [`${HANDOFF_TOKEN_PREFIX}${token}`],
            arguments: [matchId, ownerId],
        },
    )
    return serializedCredential ? JSON.parse(serializedCredential) : null
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

function deserializeGame(serializedGame) {
    const game = JSON.parse(serializedGame)
    if (!Array.isArray(game.capturedWhite)) game.capturedWhite = []
    if (!Array.isArray(game.capturedBlack)) game.capturedBlack = []
    return game
}

export async function getGame(matchId) {
    const game = await redis.hGet(GAMES_KEY, matchId)
    return game ? deserializeGame(game) : null
}

export async function setGame(game) {
    const updated = await redis.eval(
        `local serialized = redis.call('HGET', KEYS[1], ARGV[1])
         if not serialized then return 0 end
         local current = cjson.decode(serialized)
         local nextGame = cjson.decode(ARGV[2])
         if current.ownerId ~= nextGame.ownerId then return -1 end
         if (tonumber(current.version) or 0) > (tonumber(nextGame.version) or 0) then return -1 end
         redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
         return 1`,
        { keys: [GAMES_KEY], arguments: [game.matchId, JSON.stringify(game)] },
    )
    if (updated !== 1) {
        throw new Error(`Could not update match ${game.matchId}: owner changed or match no longer exists`)
    }
}

export async function markGamePlayerDisconnected(matchId, sessionToken, disconnectedAt) {
    const serializedGame = await redis.eval(
        `local serialized = redis.call('HGET', KEYS[1], ARGV[1])
         if not serialized then return false end
         local game = cjson.decode(serialized)
        local function encodeGame(value)
            local encoded = cjson.encode(value)
            if type(value.capturedWhite) == 'table' and next(value.capturedWhite) == nil then
                encoded = string.gsub(encoded, '"capturedWhite":{}', '"capturedWhite":[]')
            end
            if type(value.capturedBlack) == 'table' and next(value.capturedBlack) == nil then
                encoded = string.gsub(encoded, '"capturedBlack":{}', '"capturedBlack":[]')
            end
            return encoded
        end
        for _, player in ipairs(game.players) do
            if player.sessionToken == ARGV[2] then
                player.disconnectedAt = ARGV[3]
                local updated = encodeGame(game)
                redis.call('HSET', KEYS[1], ARGV[1], updated)
                return updated
            end
        end
         return false`,
        { keys: [GAMES_KEY], arguments: [matchId, sessionToken, disconnectedAt] },
    )
    return serializedGame ? JSON.parse(serializedGame) : null
}

export async function handoffGamePlayer(matchId, sessionToken, socketId, ownerId, previousSocketId) {
    const result = await redis.eval(
        `local serializedPlayer = redis.call('HGET', KEYS[1], ARGV[2])
         if not serializedPlayer then return {} end
         local player = cjson.decode(serializedPlayer)
         if player.matchId ~= ARGV[1]
             or (player.disconnectedAt ~= nil and player.disconnectedAt ~= cjson.null) then return {} end

         local serializedGame = redis.call('HGET', KEYS[2], ARGV[1])
         if not serializedGame then return {} end
         local game = cjson.decode(serializedGame)
         local function encodeGame(value)
             local encoded = cjson.encode(value)
             if type(value.capturedWhite) == 'table' and next(value.capturedWhite) == nil then
                 encoded = string.gsub(encoded, '"capturedWhite":{}', '"capturedWhite":[]')
             end
             if type(value.capturedBlack) == 'table' and next(value.capturedBlack) == nil then
                 encoded = string.gsub(encoded, '"capturedBlack":{}', '"capturedBlack":[]')
             end
             return encoded
         end
         if game.ownerId ~= ARGV[4] then return {} end

         local oldSocketId = player.socket_id or player.socketId
         if not oldSocketId
             or (oldSocketId ~= ARGV[5] and oldSocketId ~= ARGV[3]) then return {} end
         local matched = false
         for _, gamePlayer in ipairs(game.players) do
             if gamePlayer.sessionToken == ARGV[2] then
                 gamePlayer.socketId = ARGV[3]
                 gamePlayer.disconnectedAt = cjson.null
                 matched = true
                 break
             end
         end
         if not matched then return {} end

         player.socket_id = ARGV[3]
         player.socketId = nil
         player.disconnectedAt = cjson.null
         if oldSocketId ~= ARGV[3] then
             redis.call('HDEL', KEYS[3], oldSocketId)
         end
         redis.call('HSET', KEYS[3], ARGV[3], cjson.encode(player))
         redis.call('HSET', KEYS[1], ARGV[2], cjson.encode(player))
         local updatedGame = encodeGame(game)
         redis.call('HSET', KEYS[2], ARGV[1], updatedGame)
         return { oldSocketId, updatedGame, cjson.encode(player) }`,
        {
            keys: [SESSION_PLAYERS_KEY, GAMES_KEY, PLAYERS_KEY],
            arguments: [matchId, sessionToken, socketId, ownerId, previousSocketId],
        },
    )
    if (!result?.length) return null

    return {
        previousSocketId: result[0],
        game: deserializeGame(result[1]),
        player: deserializePlayer(result[2]),
    }
}

export async function claimFailedGame(
    matchId,
    sessionToken,
    socketId,
    ownerId,
    failedOwnerId,
    previousSocketId,
    ownerUrl,
) {
    const result = await redis.eval(
        `local serializedPlayer = redis.call('HGET', KEYS[1], ARGV[2])
         if not serializedPlayer then return { -1 } end
         local player = cjson.decode(serializedPlayer)
         if player.matchId ~= ARGV[1] then return { -1 } end

         local serializedGame = redis.call('HGET', KEYS[2], ARGV[1])
         if not serializedGame then return { -1 } end
         local game = cjson.decode(serializedGame)
         if game.ownerId ~= ARGV[5] and game.ownerId ~= ARGV[4] then
             return { 0, game.ownerId, serializedGame }
         end

         local oldSocketId = player.socket_id or player.socketId
         if not oldSocketId
             or (oldSocketId ~= ARGV[6] and oldSocketId ~= ARGV[3]) then return { -1 } end
         local matched = false
         for _, gamePlayer in ipairs(game.players) do
             if gamePlayer.sessionToken == ARGV[2] then
                 gamePlayer.socketId = ARGV[3]
                 gamePlayer.disconnectedAt = cjson.null
                 matched = true
                 break
             end
         end
         if not matched then return { -1 } end

         game.ownerId = ARGV[4]
         game.ownerUrl = ARGV[7]
         player.socket_id = ARGV[3]
         player.socketId = nil
         player.disconnectedAt = cjson.null
         if oldSocketId ~= ARGV[3] then
             redis.call('HDEL', KEYS[3], oldSocketId)
         end
         redis.call('HSET', KEYS[3], ARGV[3], cjson.encode(player))
         redis.call('HSET', KEYS[1], ARGV[2], cjson.encode(player))

         local updatedGame = cjson.encode(game)
         if type(game.capturedWhite) == 'table' and next(game.capturedWhite) == nil then
             updatedGame = string.gsub(updatedGame, '"capturedWhite":{}', '"capturedWhite":[]')
         end
         if type(game.capturedBlack) == 'table' and next(game.capturedBlack) == nil then
             updatedGame = string.gsub(updatedGame, '"capturedBlack":{}', '"capturedBlack":[]')
         end
         redis.call('HSET', KEYS[2], ARGV[1], updatedGame)
         return { 1, oldSocketId, updatedGame, cjson.encode(player) }`,
        {
            keys: [SESSION_PLAYERS_KEY, GAMES_KEY, PLAYERS_KEY],
            arguments: [matchId, sessionToken, socketId, ownerId, failedOwnerId, previousSocketId, ownerUrl],
        },
    )
    if (!result?.length || result[0] === -1) return null
    if (result[0] === 0) {
        return {
            claimed: false,
            ownerId: result[1],
            game: deserializeGame(result[2]),
        }
    }
    return {
        claimed: true,
        previousSocketId: result[1],
        game: deserializeGame(result[2]),
        player: deserializePlayer(result[3]),
    }
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
