import { useNavigate } from 'react-router-dom'

export default function PvpDashboard() {
  const navigate = useNavigate()

  return (
    <main style={styles.container}>
      <section style={styles.panel}>
        <p style={styles.kicker}>PVP Mode</p>
        <h1 style={styles.title}>Choose Match Type</h1>

        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={() => navigate('/pvp/quick')}>
            Quick Match
          </button>
          <button type="button" style={styles.secondaryButton} onClick={() => navigate('/pvp/friend')}>
            Vs Friend
          </button>
        </div>

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
    width: 'min(100%, 560px)',
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