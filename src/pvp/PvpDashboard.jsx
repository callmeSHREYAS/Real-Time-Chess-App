import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function PvpDashboard() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [error, setError] = useState('')

  function startQuickMatch() {
    const trimmedName = name.trim()
    if (trimmedName.length < 2 || trimmedName.length > 20) {
      setError('Enter a name between 2 and 20 characters.')
      return
    }

    navigate('/pvp/quick', { state: { name: trimmedName } })
  }

  return (
    <main style={styles.container}>
      <section style={styles.panel}>
        <p style={styles.kicker}>PVP Mode</p>
        <h1 style={styles.title}>Choose Match Type</h1>

        <label style={styles.nameField}>
          <span style={styles.nameLabel}>Your username</span>
          <input
            value={name}
            maxLength={20}
            onChange={event => {
              setName(event.target.value)
              setError('')
            }}
            onKeyDown={event => {
              if (event.key === 'Enter') startQuickMatch()
            }}
            placeholder="Enter your name"
            style={styles.nameInput}
          />
        </label>

        {error && <p style={styles.error}>{error}</p>}

        <div style={styles.actions}>
          <button type="button" style={styles.primaryButton} onClick={startQuickMatch}>
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
  nameField: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  nameLabel: {
    color: '#888',
    fontFamily: 'monospace',
    fontSize: '12px',
    letterSpacing: '1px',
    textTransform: 'uppercase',
  },
  nameInput: {
    boxSizing: 'border-box',
    width: '100%',
    padding: '14px 16px',
    border: '1px solid #594734',
    borderRadius: '6px',
    backgroundColor: '#24201c',
    color: '#f0d9b5',
    fontFamily: 'monospace',
    fontSize: '16px',
    outline: 'none',
  },
  error: {
    margin: '-10px 0 0',
    color: '#f0a500',
    fontFamily: 'monospace',
    fontSize: '13px',
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
