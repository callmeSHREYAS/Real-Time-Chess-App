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
  const [snapshot, setSnapshot] = useState(null)
  const [message, setMessage] = useState('Connecting to matchmaking...')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!name) {
      navigate('/pvp', { replace: true })
      return undefined
    }

    const matchmakingUrl = import.meta.env.VITE_PVP_URL || window.location.origin
    let activeMatchSnapshot = null
    let authoritativeSocket = null
    let playerSocketId = null
    let currentBootstrapSocketId = null
    let previousQueueSocketId = null
    let recoveryRequest = null
    let handoffTargetUrl = null
    const intentionallyDisconnected = new WeakSet()
    const socket = io(matchmakingUrl, {
      transports: ['websocket'],
    })
    socketRef.current = socket

    function disconnectIntentionally(targetSocket) {
      intentionallyDisconnected.add(targetSocket)
      targetSocket.disconnect()
    }

    function saveSessionToken(sessionToken) {
      if (sessionToken && sessionTokenStorageKey) {
        localStorage.setItem(sessionTokenStorageKey, sessionToken)
      }
    }

    function showGameState(nextSnapshot, gameSocket) {
      activeMatchSnapshot = nextSnapshot
      authoritativeSocket = gameSocket
      playerSocketId = nextSnapshot.recoverySocketId || gameSocket.id || playerSocketId
      socketRef.current = gameSocket
      saveSessionToken(nextSnapshot.sessionToken)
      setSnapshot(nextSnapshot)
      setMessage('')
      setError('')
    }

    function handleRecoveryResult(result) {
      const previousSocketId = recoveryRequest?.previousSocketId
      recoveryRequest = null
      if (!result?.ok) {
        setError(result?.reason || 'Could not recover the match connection.')
        return
      }

      if (result.redirectUrl) {
        playerSocketId = previousSocketId || playerSocketId
        activeMatchSnapshot = {
          ...activeMatchSnapshot,
          ownerId: result.ownerId,
          gameServerUrl: result.redirectUrl,
        }
        connectToOwner(result.redirectUrl, {
          matchId: activeMatchSnapshot.matchId,
          sessionToken: activeMatchSnapshot.sessionToken,
        })
        return
      }

      showGameState(result.snapshot, socket)
    }

    function requestGameRecovery() {
      if (!recoveryRequest || !socket.connected) return
      socket.emit('recover-game', recoveryRequest, handleRecoveryResult)
    }

    function recoverAfterDisconnect(failedSocket) {
      if (!activeMatchSnapshot || recoveryRequest || matchEndingRef.current) return

      const previousSocketId = failedSocket === authoritativeSocket
        ? failedSocket.id || playerSocketId || socket.id
        : playerSocketId || socket.id
      recoveryRequest = {
        matchId: activeMatchSnapshot.matchId,
        sessionToken: activeMatchSnapshot.sessionToken,
        failedOwnerId: activeMatchSnapshot.ownerId,
        previousSocketId,
      }
      setMessage('Match server disconnected. Reconnecting...')
      setError('')

      if (failedSocket !== socket && failedSocket.connected) {
        disconnectIntentionally(failedSocket)
      }
      if (!socket.connected) {
        intentionallyDisconnected.delete(socket)
        socket.connect()
      } else {
        requestGameRecovery()
      }
    }

    function connectToOwner(targetUrl, credentials) {
      const normalizedUrl = new URL(targetUrl, window.location.origin).origin
      if (handoffTargetUrl === normalizedUrl) return
      handoffTargetUrl = normalizedUrl
      setMessage('Joining the match server...')
      setError('')

      const gameSocket = io(normalizedUrl, {
        transports: ['websocket'],
        reconnection: false,
        timeout: 5000,
      })
      pendingSocketRef.current = gameSocket
      bindGameEvents(gameSocket)
      gameSocket.on('connect', () => {
        gameSocket.emit('authenticate-game', credentials, result => {
          if (!result?.ok) {
            handoffTargetUrl = null
            pendingSocketRef.current = null
            disconnectIntentionally(gameSocket)
            setError(result?.reason || 'Could not authenticate with the match server.')
            if (activeMatchSnapshot) recoverAfterDisconnect(gameSocket)
            return
          }

          handoffTargetUrl = null
          pendingSocketRef.current = null
          showGameState(result.snapshot, gameSocket)
          playerSocketId = gameSocket.id
          if (authoritativeSocket !== socket) {
            disconnectIntentionally(socket)
          }
        })
      })
      gameSocket.on('connect_error', () => {
        handoffTargetUrl = null
        pendingSocketRef.current = null
        setError('Could not connect to the match server. Trying another server...')
        if (activeMatchSnapshot) {
          recoverAfterDisconnect(gameSocket)
        } else if (socket.connected) {
          recoveryRequest = {
            matchId: credentials.matchId,
            sessionToken: credentials.sessionToken,
            failedOwnerId: activeMatchSnapshot?.ownerId,
            previousSocketId: socket.id,
          }
          if (recoveryRequest.failedOwnerId) requestGameRecovery()
        } else {
          socket.connect()
        }
      })
    }

    function handleGameState(sourceSocket, nextSnapshot) {
      saveSessionToken(nextSnapshot.sessionToken)
      activeMatchSnapshot = nextSnapshot
      playerSocketId = nextSnapshot.recoverySocketId || sourceSocket.id || playerSocketId
      if (sourceSocket === authoritativeSocket) {
        showGameState(nextSnapshot, sourceSocket)
        return
      }

      const targetUrl = nextSnapshot.gameServerUrl
        ? new URL(nextSnapshot.gameServerUrl, window.location.origin).origin
        : null
      if (!targetUrl) {
        setError('The match server did not provide a connection address.')
        return
      }

      if (targetUrl === new URL(matchmakingUrl, window.location.origin).origin) {
        showGameState(nextSnapshot, sourceSocket)
        return
      }

      connectToOwner(targetUrl, {
        matchId: nextSnapshot.matchId,
        sessionToken: nextSnapshot.sessionToken,
      })
    }

    function bindGameEvents(gameSocket) {
      gameSocket.on('game-state', nextSnapshot => handleGameState(gameSocket, nextSnapshot))
      gameSocket.on('move-rejected', ({ reason }) => setError(reason))
      gameSocket.on('match-ended', ({ reason }, acknowledge) => {
        matchEndingRef.current = true
        if (sessionTokenStorageKey) localStorage.removeItem(sessionTokenStorageKey)
        navigate('/pvp', {
          replace: true,
          state: { matchEndReason: reason },
        })
        window.setTimeout(() => acknowledge?.(), 100)
      })
      gameSocket.on('opponent-disconnected', ({ name: opponentName }) => {
        setMessage(`${opponentName} disconnected. Waiting for them to reconnect...`)
      })
      gameSocket.on('disconnect', () => {
        if (intentionallyDisconnected.has(gameSocket)) return
        if (gameSocket === authoritativeSocket && activeMatchSnapshot) {
          recoverAfterDisconnect(gameSocket)
        }
      })
    }

    socket.on('connect', () => {
      currentBootstrapSocketId = socket.id
      if (recoveryRequest) {
        requestGameRecovery()
        return
      }
      if (activeMatchSnapshot) return

      setMessage('Looking for an opponent...')
      socket.emit('join-quick-match', {
        name,
        sessionToken: sessionTokenStorageKey ? localStorage.getItem(sessionTokenStorageKey) : null,
        previousSocketId: previousQueueSocketId,
      })
      previousQueueSocketId = null
    })
    socket.on('queue-status', ({ position }) => {
      setMessage(position === 1 ? 'Waiting for an opponent...' : `Waiting in position ${position}...`)
    })
    socket.on('queue-error', ({ reason }) => setError(reason))
    bindGameEvents(socket)
    socket.on('connect_error', () => setError('Could not connect to the PvP server.'))
    socket.on('disconnect', () => {
      if (intentionallyDisconnected.has(socket)) return
      if (socket === authoritativeSocket && activeMatchSnapshot) {
        recoverAfterDisconnect(socket)
      } else if (!activeMatchSnapshot) {
        previousQueueSocketId = currentBootstrapSocketId || socket.id
        currentBootstrapSocketId = null
      }
    })

    return () => {
      if (!matchEndingRef.current) {
        socket.emit('leave-queue')
      }
      disconnectIntentionally(socket)
      if (socketRef.current && socketRef.current !== socket) {
        disconnectIntentionally(socketRef.current)
      }
      if (pendingSocketRef.current) disconnectIntentionally(pendingSocketRef.current)
      socketRef.current = null
      pendingSocketRef.current = null
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