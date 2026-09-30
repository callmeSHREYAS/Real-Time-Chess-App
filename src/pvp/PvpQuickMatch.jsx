import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import PvpChessBoard from './PvpChessBoard'

function getSessionTokenStorageKey(name) {
  return `pvp-session-token:${encodeURIComponent(name.toLowerCase())}`
}

export default function PvpQuickMatch() {
  const navigate = useNavigate()
  const location = useLocation()
  const name = location.state?.name
  const sessionTokenStorageKey = name ? getSessionTokenStorageKey(name) : null
  const socketRef = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [message, setMessage] = useState('Connecting to matchmaking...')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) {
      navigate('/pvp', { replace: true })
      return undefined
    }

    const socket = io('http://localhost:3001')
    socketRef.current = socket

    socket.on('connect', () => {
      setMessage('Looking for an opponent...')
      socket.emit('join-quick-match', {
        name,
        sessionToken: sessionTokenStorageKey ? localStorage.getItem(sessionTokenStorageKey) : null,
      })
    })
    socket.on('queue-status', ({ position }) => {
      setMessage(position === 1 ? 'Waiting for an opponent...' : `Waiting in position ${position}...`)
    })
    socket.on('queue-error', ({ reason }) => setError(reason))
    socket.on('match-found', match => setSnapshot(match))
    socket.on('game-state', nextSnapshot => {
      if (nextSnapshot.sessionToken && sessionTokenStorageKey) {
        localStorage.setItem(sessionTokenStorageKey, nextSnapshot.sessionToken)
      }
      setSnapshot(nextSnapshot)
      setMessage('')
      setError('')
    })
    socket.on('move-rejected', ({ reason }) => setError(reason))
    socket.on('match-ended', ({ reason }) => {
      if (sessionTokenStorageKey) localStorage.removeItem(sessionTokenStorageKey)
      setSnapshot(null)
      setMessage(reason)
    })
    socket.on('opponent-disconnected', ({ name: opponentName }) => {
      setMessage(`${opponentName} disconnected. Waiting for them to reconnect...`)
    })
    socket.on('connect_error', () => setError('Could not connect to the PvP server.'))

    return () => {
      socket.emit('leave-queue')
      socket.disconnect()
      socketRef.current = null
    }
  }, [name, navigate, sessionTokenStorageKey])

  function submitMove(move) {
    socketRef.current?.emit('submit-move', move)
  }

  function leaveMatch() {
    const socket = socketRef.current
    if (!socket) {
      navigate('/pvp')
      return
    }

    socket.emit('leave match', result => {
      if (!result?.ok) {
        setError(result?.reason || 'Could not leave the match')
        return
      }

          if (sessionTokenStorageKey) localStorage.removeItem(sessionTokenStorageKey)
      socket.disconnect()
      navigate('/pvp')
    })
  }

  return (
    <main style={styles.container}>
      {snapshot ? (
        <>
          <PvpChessBoard
            key={`${snapshot.matchId}-${snapshot.board.join('-')}`}
            snapshot={snapshot}
            onSubmitMove={submitMove}
            error={error}
          />
          {message && <p style={styles.status}>{message}</p>}
        </>
      ) : (
        <section style={styles.waitingPanel}>
          <p style={styles.kicker}>Quick Match</p>
          <h1 style={styles.title}>{message}</h1>
          {error && <p style={styles.error}>{error}</p>}
        </section>
      )}

      <button type="button" style={styles.back} onClick={leaveMatch}>
        Leave Match
      </button>
    </main>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '24px',
    boxSizing: 'border-box',
    backgroundColor: '#1a1a1a',
  },
  waitingPanel: {
    width: 'min(100%, 560px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '18px',
  },
  kicker: {
    margin: 0,
    color: '#b58863',
    fontFamily: 'monospace',
    fontSize: '13px',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },
  title: {
    margin: 0,
    color: '#f0d9b5',
    fontFamily: 'Georgia, serif',
    fontSize: 'clamp(28px, 6vw, 48px)',
    textAlign: 'center',
  },
  error: {
    margin: 0,
    color: '#f0a500',
    fontFamily: 'monospace',
    fontSize: '13px',
    textAlign: 'center',
  },
  status: {
    margin: 0,
    color: '#f0a500',
    fontFamily: 'monospace',
    fontSize: '13px',
    textAlign: 'center',
  },
  back: {
    background: 'none',
    border: '1px solid #444',
    color: '#888',
    padding: '8px 20px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '13px',
    letterSpacing: '1px',
  },
}