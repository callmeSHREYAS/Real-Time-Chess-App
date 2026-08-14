import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const DIFFICULTY_DEPTH = {
  easy: 2,
  medium: 3,
  hard: 5,
  extreme: 6,
}

export default function ColorPicker() {
  const navigate = useNavigate()
  const [difficulty, setDifficulty] = useState('medium')

  function handleChoice(color) {
    const depth = DIFFICULTY_DEPTH[difficulty]
    navigate('/chessboard', { state: { userColor: color, difficulty, depth } })
  }

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Chess</h1>
      <p style={styles.subtitle}>Choose your side</p>

      <div style={styles.difficultyBox}>
        <span style={styles.difficultyLabel}>Difficulty</span>
        <div style={styles.difficultyOptions}>
          {Object.entries(DIFFICULTY_DEPTH).map(([name, depth]) => (
            <button
              key={name}
              type="button"
              onClick={() => setDifficulty(name)}
              style={{
                ...styles.difficultyButton,
                ...(difficulty === name ? styles.difficultyButtonActive : {}),
              }}
            >
              <span style={styles.difficultyName}>{name}</span>
              <span style={styles.difficultyDepth}>Depth {depth}</span>
            </button>
          ))}
        </div>
      </div>

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
  difficultyBox: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
  },
  difficultyLabel: {
    color: '#888',
    fontSize: '13px',
    fontFamily: 'monospace',
    letterSpacing: '2px',
    textTransform: 'uppercase',
  },
  difficultyOptions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  difficultyButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    minWidth: '90px',
    padding: '10px 12px',
    backgroundColor: '#2a2a2a',
    border: '1px solid #3c2f24',
    borderRadius: '8px',
    color: '#888',
    cursor: 'pointer',
    fontFamily: 'monospace',
    textTransform: 'capitalize',
  },
  difficultyButtonActive: {
    borderColor: '#b58863',
    color: '#f0d9b5',
    backgroundColor: '#3c2f24',
  },
  difficultyName: {
    fontSize: '13px',
    fontWeight: 700,
  },
  difficultyDepth: {
    fontSize: '10px',
    color: '#666',
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
