import { useNavigate } from 'react-router-dom'

export default function ColorPicker() {
  const navigate = useNavigate()

  function handleChoice(color) {
    navigate('/chessboard', { state: { userColor: color } })
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Chess</h1>
      <p style={styles.subtitle}>Choose your side</p>

      <div style={styles.cards}>

        {/* White */}
        <div style={styles.card} onClick={() => handleChoice('white')}>
          <span style={styles.pieceWhite}>♔</span>
          <span style={styles.label}>White</span>
          <span style={styles.hint}>You move first</span>
        </div>

        {/* Black */}
        <div style={styles.card} onClick={() => handleChoice('black')}>
          <span style={styles.pieceBlack}>♚</span>
          <span style={styles.label}>Black</span>
          <span style={styles.hint}>AI moves first</span>
        </div>

      </div>
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
    backgroundColor: '#1a1a1a',
    gap: '24px',
  },
  title: {
    color: '#f0d9b5',
    fontSize: '48px',
    fontFamily: 'Georgia, serif',
    margin: 0,
    letterSpacing: '4px',
  },
  subtitle: {
    color: '#888',
    fontSize: '16px',
    fontFamily: 'monospace',
    margin: 0,
    letterSpacing: '2px',
  },
  cards: {
    display: 'flex',
    gap: '32px',
    marginTop: '16px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    width: '160px',
    height: '200px',
    backgroundColor: '#2a2a2a',
    border: '2px solid #3c2f24',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    userSelect: 'none',
  },
  pieceWhite: {
    fontSize: '72px',
    color: '#ffffff',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))',
    fontFamily: 'Segoe UI Symbol, Georgia, serif',
  },
  pieceBlack: {
    fontSize: '72px',
    color: '#111111',
    filter: 'drop-shadow(0 2px 4px rgba(255,255,255,0.15))',
    fontFamily: 'Segoe UI Symbol, Georgia, serif',
  },
  label: {
    color: '#f0d9b5',
    fontSize: '20px',
    fontWeight: 700,
    fontFamily: 'monospace',
  },
  hint: {
    color: '#666',
    fontSize: '12px',
    fontFamily: 'monospace',
  },
}