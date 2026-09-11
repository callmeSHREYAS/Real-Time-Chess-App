import { useNavigate } from 'react-router-dom'

export default function PvpFriendPlaceholder() {
  const navigate = useNavigate()

  return (
    <main style={styles.container}>
      <section style={styles.panel}>
        <p style={styles.kicker}>Vs Friend</p>
        <h1 style={styles.title}>Coming Soon</h1>
        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={() => navigate('/pvp/quick')}>
            Play Quick Match
          </button>
          <button type="button" style={styles.backButton} onClick={() => navigate('/pvp')}>
            Back
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
    fontSize: 'clamp(38px, 9vw, 64px)',
    letterSpacing: '0',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center',
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
}
