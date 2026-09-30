import { readFile } from 'node:fs/promises'
import { Pool } from 'pg'

const pool = new Pool({
    connectionString: globalThis.process?.env?.DATABASE_URL || 'postgres://chess:chess@127.0.0.1:15432/chess',
})

export async function initializeDatabase() {
    const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8')
    await pool.query(schema)
}

export async function registerSocketPlayer(socketId, name) {
    const client = await pool.connect()

    try {
        await client.query('BEGIN')
        await client.query(
            'INSERT INTO users (u_name) VALUES ($1) ON CONFLICT (u_name) DO NOTHING',
            [name],
        )

        const userResult = await client.query(
            'SELECT u_name FROM users WHERE u_name = $1',
            [name],
        )
        const canonicalName = userResult.rows[0].u_name
        const nameInUse = await client.query(
            'SELECT 1 FROM players_by_socket WHERE u_name = $1 AND socket_id <> $2 LIMIT 1',
            [canonicalName, socketId],
        )

        if (nameInUse.rowCount > 0) {
            const error = new Error('That username is already in use')
            error.code = 'USERNAME_IN_USE'
            throw error
        }

        await client.query(
            `INSERT INTO players_by_socket (socket_id, u_name)
             VALUES ($1, $2)
             ON CONFLICT (socket_id) DO UPDATE SET u_name = EXCLUDED.u_name`,
            [socketId, canonicalName],
        )
        await client.query('COMMIT')
        return canonicalName
    } catch (error) {
        await client.query('ROLLBACK')
        if (error.code === '23505') {
            const duplicateName = new Error('That username is already in use')
            duplicateName.code = 'USERNAME_IN_USE'
            throw duplicateName
        }
        throw error
    } finally {
        client.release()
    }
}

export async function getSocketPlayer(socketId) {
    const result = await pool.query(
        'SELECT socket_id AS "socketId", u_name AS name FROM players_by_socket WHERE socket_id = $1',
        [socketId],
    )
    return result.rows[0] || null
}

export async function removeSocketPlayer(socketId) {
    await pool.query('DELETE FROM players_by_socket WHERE socket_id = $1', [socketId])
}

export async function removeUser(name) {
    await pool.query('DELETE FROM users WHERE u_name = $1', [name])
}

export async function getDisconnectedUser(name) {
    const result = await pool.query(
        `SELECT u_name AS name,
                "sessionToken" AS "sessionToken",
                "disconnectedAt" AS "disconnectedAt"
         FROM "disconnectedUsers"
         WHERE u_name = $1
         LIMIT 1`,
        [name],
    )
    return result.rows[0] || null
}

export async function saveDisconnectedUser(name, sessionToken, disconnectedAt) {
    const client = await pool.connect()

    try {
        await client.query('BEGIN')
        await client.query('DELETE FROM "disconnectedUsers" WHERE u_name = $1', [name])
        await client.query(
            `INSERT INTO "disconnectedUsers" (u_name, "sessionToken", "disconnectedAt")
             VALUES ($1, $2, $3)`,
            [name, sessionToken, disconnectedAt],
        )
        await client.query('COMMIT')
    } catch (error) {
        await client.query('ROLLBACK')
        throw error
    } finally {
        client.release()
    }
}

export async function removeDisconnectedUser(name, sessionToken) {
    await pool.query(
        'DELETE FROM "disconnectedUsers" WHERE u_name = $1 AND "sessionToken" = $2',
        [name, sessionToken],
    )
}


export async function clearSocketPlayers() {
    await pool.query('DELETE FROM players_by_socket')
}

export async function closeDatabase() {
    await pool.end()
}
