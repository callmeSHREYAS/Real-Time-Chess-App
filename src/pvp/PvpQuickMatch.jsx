import { useNavigate } from 'react-router-dom'
import PvpChessBoard from './PvpChessBoard'
import { setupStartingPosition } from '../computer/engine/board'

export default function PvpQuickMatch() {
  const navigate = useNavigate()

  return (
    <main style={styles.container}>
      <PvpChessBoard initialBoard={setupStartingPosition()} />

      <button type="button" style={styles.back} onClick={() => navigate('/pvp')}>
        Back to PVP
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