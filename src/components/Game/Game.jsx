import { useLocation, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import ChessBoard from '../ChessBoard/ChessBoard'
import { setupStartingPosition } from '../../engine/board'
import { Color } from '../../engine/board'

export default function Game() {
  const location = useLocation()
  const navigate = useNavigate()
  const userColor = location.state?.userColor  // 'white' or 'black'
  const depth = location.state?.depth ?? 3

  // if someone navigates to /chessboard directly without picking a color
  useEffect(() => {
    if (!userColor) navigate('/')
  }, [userColor, navigate])

  if (!userColor) return null

  const board      = setupStartingPosition()
  const colorConst = userColor === 'white' ? Color.White : Color.Black

  return (
    <div style={styles.container}>
      <ChessBoard initialBoard={board} userColor={colorConst} depth={depth} />

      <button style={styles.back} onClick={() => navigate('/')}>
        ← New Game
      </button>
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: '20px',
    backgroundColor: '#1a1a1a',
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
