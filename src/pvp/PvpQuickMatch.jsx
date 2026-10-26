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
    let previousQueueSocketId = null
    let currentQueueSocketId = null
    let recoveryRequest = null
    let recoveryStartedAt = 0
    let recoveryTimer = null
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
      activeMatchSnapshot = {
        ...nextSnapshot,
        recoverySocketId: gameSocket.id || nextSnapshot.recoverySocketId,
      }
      authoritativeSocket = gameSocket
      socketRef.current = gameSocket
      saveSessionToken(nextSnapshot.sessionToken)
      setSnapshot(nextSnapshot)
      setMessage('')
      setError('')
    }

    function requestGameRecovery() {
      if (!recoveryRequest || !socket.connected) return

      socket.timeout(4000).emit('recover-game', recoveryRequest, (timeoutError, result) => {
        if (timeoutError) {
          result = { ok: false, reason: 'The match server did not respond. Retrying...' }
        }
        if (!result?.ok) {
          setError(result?.reason || 'Could not recover the match connection. Retrying...')
          if (Date.now() - recoveryStartedAt < 30_000) {
            recoveryTimer = window.setTimeout(requestGameRecovery, 1000)
          } else {
            recoveryRequest = null
          }
          return
        }

        if (result.redirectUrl) {
          activeMatchSnapshot = {
            ...activeMatchSnapshot,
            ownerId: result.ownerId,
            gameServerUrl: result.redirectUrl,
          }
          connectToOwner(result.redirectUrl, {
            matchId: activeMatchSnapshot.matchId,
            sessionToken: activeMatchSnapshot.sessionToken,
            previousSocketId: recoveryRequest.previousSocketId,
          }, false)
          return
        }

        recoveryRequest = null
        window.clearTimeout(recoveryTimer)
        showGameState(result.snapshot, socket)
      })
    }

    function recoverAfterDisconnect(failedSocket) {
      if (!activeMatchSnapshot || matchEndingRef.current) return
      if (recoveryRequest) {
        if (socket.connected) requestGameRecovery()
        return
      }

      const previousSocketId = failedSocket === authoritativeSocket
        ? failedSocket.id || activeMatchSnapshot.recoverySocketId
        : activeMatchSnapshot.recoverySocketId || failedSocket.id
      recoveryRequest = {
        matchId: activeMatchSnapshot.matchId,
        sessionToken: activeMatchSnapshot.sessionToken,
        failedOwnerId: activeMatchSnapshot.ownerId,
        previousSocketId,
      }
      recoveryStartedAt = Date.now()
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

    function connectToOwner(targetUrl, credentials, useHandoffToken) {
      const normalizedUrl = new URL(targetUrl, window.location.origin).origin
      if (handoffTargetUrl === normalizedUrl) return
      handoffTargetUrl = normalizedUrl
      setMessage('Joining the match server...')
      setError('')

      const gameSocket = io(normalizedUrl, {
        transports: ['websocket'],
        autoConnect: false,
        reconnection: false,
        timeout: 5000,
      })
      pendingSocketRef.current = gameSocket
      gameSocket.on('match-authenticated', authentication => {
        activeMatchSnapshot = {
          ...activeMatchSnapshot,
          ...authentication,
          gameServerUrl: authentication.gameServerUrl || normalizedUrl,
        }
        authoritativeSocket = gameSocket
        handoffTargetUrl = null
        pendingSocketRef.current = null
        recoveryRequest = null
        window.clearTimeout(recoveryTimer)
        socketRef.current = gameSocket
        saveSessionToken(authentication.sessionToken)
        setMessage('')
        setError('')
        if (socket.connected) disconnectIntentionally(socket)
      })
      gameSocket.on('game-state', nextSnapshot => {
        showGameState(nextSnapshot, gameSocket)
      })
      gameSocket.on('match-auth-error', ({ reason }) => {
        handoffTargetUrl = null
        pendingSocketRef.current = null
        setError(reason || 'Could not authenticate with the match server.')
        if (recoveryRequest && !useHandoffToken) {
          recoveryRequest = null
          disconnectIntentionally(gameSocket)
          return
        }
        recoverAfterDisconnect(gameSocket)
      })
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
        if (!intentionallyDisconnected.has(gameSocket)) {
          handoffTargetUrl = null
          pendingSocketRef.current = null
          recoverAfterDisconnect(gameSocket)
        }
      })
      gameSocket.on('connect_error', () => {
        handoffTargetUrl = null
        pendingSocketRef.current = null
        setError('Could not connect to the match server. Trying another server...')
        recoverAfterDisconnect(gameSocket)
      })
      gameSocket.on('connect', () => {
        if (useHandoffToken && credentials.handoffToken) {
          gameSocket.emit('authenticate-match', {
            matchId: credentials.matchId,
            handoffToken: credentials.handoffToken,
          })
        } else {
          gameSocket.emit('authenticate-game', {
            matchId: credentials.matchId,
            sessionToken: credentials.sessionToken,
            previousSocketId: credentials.previousSocketId,
          })
        }
      })
      gameSocket.connect()
    }

    socket.on('connect', () => {
      currentQueueSocketId = socket.id
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
    })
    socket.on('queue-status', ({ position }) => {
      previousQueueSocketId = null
      currentQueueSocketId = socket.id
      setMessage(position === 1 ? 'Waiting for an opponent...' : `Waiting in position ${position}...`)
    })
    socket.on('queue-error', ({ reason }) => setError(reason))
    socket.on('match-handoff', handoff => {
      previousQueueSocketId = null
      activeMatchSnapshot = {
        ...activeMatchSnapshot,
        matchId: handoff.matchId,
        ownerId: handoff.ownerId,
        gameServerUrl: handoff.serverUrl,
        sessionToken: handoff.sessionToken,
        recoverySocketId: handoff.previousSocketId,
      }
      saveSessionToken(handoff.sessionToken)
      connectToOwner(handoff.serverUrl, handoff, Boolean(handoff.handoffToken))
    })
    socket.on('game-state', nextSnapshot => {
      if (authoritativeSocket === socket) showGameState(nextSnapshot, socket)
    })
    socket.on('move-rejected', ({ reason }) => setError(reason))
    socket.on('match-ended', ({ reason }, acknowledge) => {
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
    socket.on('opponent-disconnected', ({ name: opponentName }) => {
      setMessage(`${opponentName} disconnected. Waiting for them to reconnect...`)
    })
    socket.on('disconnect', () => {
      if (intentionallyDisconnected.has(socket)) return
      if (activeMatchSnapshot) {
        recoverAfterDisconnect(socket)
      } else {
        previousQueueSocketId = currentQueueSocketId || previousQueueSocketId
        currentQueueSocketId = null
        setMessage('Matchmaking connection lost. Reconnecting...')
      }
    })
    socket.on('connect_error', () => {
      setError('Could not connect to the PvP server. Reconnecting...')
    })

    return () => {
      window.clearTimeout(recoveryTimer)
      if (!matchEndingRef.current && !activeMatchSnapshot) socket.emit('leave-queue')
      disconnectIntentionally(socket)
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

      matchEndingRef.current = true
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