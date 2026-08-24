import { useNavigate } from 'react-router-dom'

export default function PvpDashboard() {
  const navigate = useNavigate()

  return (
    <main style={styles.container}>
      <section style={styles.panel}>
        <p style={styles.kicker}>PVP Mode</p>
        <h1 style={styles.title}>Working on PVP</h1>
        <button type="button" style={styles.backButton} onClick={() => navigate('/')}>
          Back to Menu
        </button>
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
    fontSize: 'clamp(34px, 8vw, 56px)',
    letterSpacing: '0',
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
