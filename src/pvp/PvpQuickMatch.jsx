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
  const pendingSocketRef = useRef(null)
  const matchEndingRef = useRef(false)
  const handoffInProgressRef = useRef(false)
  const playerAuthRef = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [message, setMessage] = useState('Connecting to matchmaking...')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) {
      navigate('/pvp', { replace: true })
      return undefined
    }

    const socket = io(import.meta.env.VITE_PVP_URL || window.location.origin, {
      transports: ['websocket'],
    })
    socketRef.current = socket

    function onMatchAuthenticated(gameSocket, authentication, isHandoff) {
      playerAuthRef.current = authentication
      if (authentication.sessionToken && sessionTokenStorageKey) {
        localStorage.setItem(sessionTokenStorageKey, authentication.sessionToken)
      }
      if (isHandoff) {
        socketRef.current = gameSocket
        pendingSocketRef.current = null
        handoffInProgressRef.current = false
        socket.disconnect()
      }
      setMessage('')
      setError('')
    }

    function addGameSocketHandlers(gameSocket, isHandoff = false) {
      gameSocket.on('match-authenticated', authentication => {
        onMatchAuthenticated(gameSocket, authentication, isHandoff)
      })
      gameSocket.on('game-state', nextSnapshot => {
        if (!playerAuthRef.current) return
        setSnapshot({ ...nextSnapshot, ...playerAuthRef.current })
        setMessage('')
        setError('')
      })
      gameSocket.on('match-ended', ({ reason }, acknowledge) => {
        matchEndingRef.current = true
        if (sessionTokenStorageKey) localStorage.removeItem(sessionTokenStorageKey)
        navigate('/pvp', {
          replace: true,
          state: { matchEndReason: reason },
        })
        window.setTimeout(() => {
          acknowledge?.()
        }, 100)
      })
      gameSocket.on('opponent-disconnected', ({ name: opponentName }) => {
        setMessage(`${opponentName} disconnected. Waiting for them to reconnect...`)
      })
    }

    addGameSocketHandlers(socket)
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
    socket.on('match-handoff', ({ matchId, serverUrl, handoffToken }) => {
      if (handoffInProgressRef.current) return
      handoffInProgressRef.current = true
      setMessage('Connecting to the game server...')

      const gameSocket = io(serverUrl, {
        transports: ['websocket'],
        autoConnect: false,
      })
      pendingSocketRef.current = gameSocket
      addGameSocketHandlers(gameSocket, true)
      gameSocket.on('connect', () => {
        gameSocket.emit('authenticate-match', { matchId, handoffToken })
      })
      gameSocket.on('match-auth-error', ({ reason }) => {
        handoffInProgressRef.current = false
        pendingSocketRef.current = null
        gameSocket.disconnect()
        setError(reason)
      })
      gameSocket.on('connect_error', () => {
        handoffInProgressRef.current = false
        pendingSocketRef.current = null
        gameSocket.disconnect()
        setError('Could not connect to the selected game server.')
      })
      gameSocket.connect()
    })
    socket.on('move-rejected', ({ reason }) => setError(reason))
    socket.on('match-auth-error', ({ reason }) => setError(reason))
    socket.on('connect_error', () => setError('Could not connect to the PvP server.'))

    return () => {
      if (!matchEndingRef.current) socket.emit('leave-queue')
      socket.disconnect()
      pendingSocketRef.current?.disconnect()
      socketRef.current = null
      pendingSocketRef.current = null
      playerAuthRef.current = null
      handoffInProgressRef.current = false
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

      if (!snapshot) {
        socket.disconnect()
        pendingSocketRef.current?.disconnect()
        navigate('/pvp')
      }
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