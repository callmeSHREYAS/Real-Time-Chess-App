import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { io } from 'socket.io-client'
import { Color } from '../computer/engine/board.js'
import PvpChessBoard from './PvpChessBoard.jsx'

const SOCKET_URL = import.meta.env.VITE_PVP_SOCKET_URL || 'http://localhost:3001'

export default function PvpQuickMatch() {
  const navigate = useNavigate()
  const socketRef = useRef(null)
  const [username, setUsername] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('connecting')
  const [matchStatus, setMatchStatus] = useState('idle')
  const [roomId, setRoomId] = useState(null)
  const [yourColor, setYourColor] = useState(null)
  const [whiteUsername, setWhiteUsername] = useState('')
  const [blackUsername, setBlackUsername] = useState('')
  const [gameSnapshot, setGameSnapshot] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['polling', 'websocket'],
      reconnection: true,
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnectionStatus('connected')
      setMessage('')
    })

    socket.on('connect_error', () => {
      setConnectionStatus('disconnected')
      setMessage('Unable to connect to the game server.')
    })

    socket.on('disconnect', reason => {
      setConnectionStatus('disconnected')
      setMessage(reason === 'io server disconnect'
        ? 'The game server disconnected you.'
        : 'Connection to the game server was lost.')
      setMatchStatus(status => status === 'matched' ? 'opponent-left' : status)
    })

    socket.on('queue:waiting', () => {
      setMatchStatus('waiting')
      setMessage('Waiting for another player...')
    })

    socket.on('queue:error', payload => {
      setMatchStatus('idle')
      setMessage(payload?.message || 'Could not join queue.')
    })

    socket.on('match:started', payload => {
      setRoomId(payload.roomId)
      setYourColor(payload.yourColor)
      setWhiteUsername(payload.whiteUsername)
      setBlackUsername(payload.blackUsername)
      setGameSnapshot(payload.state)
      setMatchStatus('matched')
      setMessage('')
    })

    socket.on('game:state', state => {
      setGameSnapshot(state)
      setMessage('')
    })

    socket.on('move:rejected', payload => {
      setMessage(payload?.reason || 'Move rejected by server.')
    })

    socket.on('opponent:left', () => {
      setMatchStatus('opponent-left')
      setMessage('Opponent left the match.')
    })

    return () => {
      socket.emit('queue:leave')
      socket.disconnect()
    }
  }, [])

  const playerLabel = useMemo(() => {
    if (!yourColor) return ''
    return yourColor === Color.White ? 'White' : 'Black'
  }, [yourColor])

  function joinQueue(event) {
    event.preventDefault()
    const cleanName = username.trim()
    if (!cleanName) {
      setMessage('Enter a username.')
      return
    }

    socketRef.current?.emit('queue:join', { username: cleanName })
  }

  function leaveQueue() {
    socketRef.current?.emit('queue:leave')
    setMatchStatus('idle')
    setMessage('')
  }

  function handleMoveAttempt(move) {
    if (!roomId || connectionStatus !== 'connected') {
      setMessage('Waiting for the game server connection.')
      return
    }
    socketRef.current?.emit('move:attempt', {
      roomId,
      ...move,
    })
  }

  return (
    <main style={styles.container}>
      {matchStatus !== 'matched' && (
        <section style={styles.panel}>
          <p style={styles.kicker}>Quick Match</p>
          <h1 style={styles.title}>Online Matchmaking</h1>

          {matchStatus === 'idle' && (
            <form style={styles.form} onSubmit={joinQueue}>
              <input
                value={username}
                onChange={event => setUsername(event.target.value)}
                style={styles.input}
                maxLength={24}
                placeholder="Username"
                disabled={connectionStatus !== 'connected'}
              />
              <button
                type="submit"
                style={styles.primaryButton}
                disabled={connectionStatus !== 'connected'}
              >
                Find Match
              </button>
            </form>
          )}

          {matchStatus === 'waiting' && (
            <div style={styles.waitBox}>
              <span style={styles.waitText}>Waiting for opponent</span>
              <button type="button" style={styles.backButton} onClick={leaveQueue}>
                Cancel
              </button>
            </div>
          )}

          {matchStatus === 'opponent-left' && (
            <div style={styles.waitBox}>
              <span style={styles.waitText}>Opponent left</span>
              <button type="button" style={styles.primaryButton} onClick={() => setMatchStatus('idle')}>
                Back to Queue
              </button>
            </div>
          )}

          {message && <p style={styles.message}>{message}</p>}
          {connectionStatus !== 'connected' && (
            <p style={styles.message}>Socket server is {connectionStatus}</p>
          )}

          <button type="button" style={styles.backButton} onClick={() => navigate('/pvp')}>
            Back
          </button>
        </section>
      )}

      {matchStatus === 'matched' && gameSnapshot && (
        <>
          <div style={styles.matchHeader}>
            <span style={styles.nameTag}>{whiteUsername || 'White'}</span>
            <span style={styles.centerTag}>You are {playerLabel}</span>
            <span style={styles.nameTag}>{blackUsername || 'Black'}</span>
          </div>

          <PvpChessBoard
            board={gameSnapshot.board}
            currentTurn={gameSnapshot.currentTurn}
            gameState={gameSnapshot.gameState}
            enPassantSquare={gameSnapshot.enPassantSquare}
            gameStatus={gameSnapshot.gameStatus}
            capturedWhite={gameSnapshot.capturedWhite}
            capturedBlack={gameSnapshot.capturedBlack}
            yourColor={yourColor}
            whiteUsername={whiteUsername}
            blackUsername={blackUsername}
            disabled={matchStatus !== 'matched'}
            onMoveAttempt={handleMoveAttempt}
          />

          {message && <p style={styles.message}>{message}</p>}

          <div style={styles.actions}>
            <button type="button" style={styles.backButton} onClick={() => navigate('/pvp')}>
              Back
            </button>
          </div>
        </>
      )}
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
    gap: '18px',
    padding: '24px',
    boxSizing: 'border-box',
    backgroundColor: '#1a1a1a',
  },
  panel: {
    width: 'min(100%, 520px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
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
    fontSize: 'clamp(34px, 8vw, 56px)',
    letterSpacing: '0',
  },
  form: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '1fr auto',
    gap: '10px',
  },
  input: {
    minWidth: 0,
    border: '1px solid #3c2f24',
    borderRadius: '6px',
    backgroundColor: '#111',
    color: '#f0d9b5',
    fontFamily: 'monospace',
    fontSize: '15px',
    padding: '11px 12px',
    outline: 'none',
  },
  primaryButton: {
    border: '2px solid #b58863',
    borderRadius: '6px',
    backgroundColor: '#3c2f24',
    color: '#f0d9b5',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '14px',
    fontWeight: 700,
    padding: '10px 22px',
  },
  backButton: {
    border: '1px solid #b58863',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: '#f0d9b5',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '14px',
    padding: '10px 22px',
  },
  waitBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '14px',
    flexWrap: 'wrap',
  },
  waitText: {
    color: '#f0d9b5',
    fontFamily: 'monospace',
    fontSize: '15px',
    letterSpacing: '1px',
  },
  message: {
    color: '#f0a500',
    fontFamily: 'monospace',
    fontSize: '13px',
    letterSpacing: '1px',
  },
  matchHeader: {
    width: 'min(86vw, 520px)',
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '10px',
    color: '#f0d9b5',
    fontFamily: 'monospace',
    fontSize: '13px',
  },
  nameTag: {
    padding: '6px 8px',
    border: '1px solid #3c2f24',
    borderRadius: '6px',
  },
  centerTag: {
    color: '#b58863',
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
}
