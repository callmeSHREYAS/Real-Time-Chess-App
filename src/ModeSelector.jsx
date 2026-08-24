import { useNavigate } from 'react-router-dom'

export default function ModeSelector() {
  const navigate = useNavigate()

  return (
    <main style={styles.container}>
      <section style={styles.panel}>
        <p style={styles.kicker}>Chess Arena</p>
        <h1 style={styles.title}>Choose Game Mode</h1>

        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={() => navigate('/computer')}>
            Play vs Computer
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => navigate('/pvp')}>
            Play vs PVP
          </button>
        </div>
      </section>
    </main>
  )
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box',
    backgroundColor: '#1a1a1a',
  },
  panel: {
    width: 'min(100%, 520px)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '22px',
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
  actions: {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '16px',
  },
  primaryButton: {
    minHeight: '92px',
    border: '2px solid #b58863',
    borderRadius: '8px',
    backgroundColor: '#3c2f24',
    color: '#f0d9b5',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '16px',
    fontWeight: 700,
  },
  secondaryButton: {
    minHeight: '92px',
    border: '2px solid #3c2f24',
    borderRadius: '8px',
    backgroundColor: '#2a2a2a',
    color: '#f0d9b5',
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: '16px',
    fontWeight: 700,
  },
}
