import { redisClient } from './redis.js'

const RATE_LIMIT_KEY_PREFIX = 'chess:pvp:rate-limit:'

export const JOIN_RATE_LIMIT = { maxRequests: 5, windowSeconds: 10 }
export const MOVE_RATE_LIMIT = { maxRequests: 30, windowSeconds: 10 }

// Counters live in Redis so the limits still hold when several server
// processes share the same instance. The first request in a window seeds
// the key's TTL; each later request merely increments and is compared to
// the cap, so the window always starts from the first request, not the
// last one.
export async function isRateLimited(identity, action, { maxRequests, windowSeconds }) {
    const key = `${RATE_LIMIT_KEY_PREFIX}${action}:${identity}`
    const requestCount = await redisClient.incr(key)
    if (requestCount === 1) await redisClient.expire(key, windowSeconds)
    return requestCount > maxRequests
}