import { Piece, Color } from '../../engine/board.js'

const PIECE_UNICODE = {
    [Color.White | Piece.King]:   '♔',
    [Color.White | Piece.Queen]:  '♕',
    [Color.White | Piece.Rook]:   '♖',
    [Color.White | Piece.Bishop]: '♗',
    [Color.White | Piece.Knight]: '♘',
    [Color.White | Piece.Pawn]:   '♙',
    [Color.Black | Piece.King]:   '♚',
    [Color.Black | Piece.Queen]:  '♛',
    [Color.Black | Piece.Rook]:   '♜',
    [Color.Black | Piece.Bishop]: '♝',
    [Color.Black | Piece.Knight]: '♞',
    [Color.Black | Piece.Pawn]:   '♟',
}

// material value for advantage calculation
const PIECE_VALUES = {
    [Piece.Pawn]:   1,
    [Piece.Knight]: 3,
    [Piece.Bishop]: 3,
    [Piece.Rook]:   5,
    [Piece.Queen]:  9,
    [Piece.King]:   0,
}

export default function CapturedPieces({ captured, playerColor, label }) {

    // sort by value so pieces appear grouped (pawns first, then minor, major)
    const sorted = [...captured].sort((a, b) => {
        const valA = PIECE_VALUES[a.piece & 0b00111] ?? 0
        const valB = PIECE_VALUES[b.piece & 0b00111] ?? 0
        return valA - valB
    })

    // calculate material advantage
    const totalValue = captured.reduce((sum, c) => {
        return sum + (PIECE_VALUES[c.piece & 0b00111] ?? 0)
    }, 0)

    return (
        <div style={styles.container}>
            <span style={styles.label}>{label}</span>
            <div style={styles.pieces}>
                {sorted.map((c, i) => (
                    <span key={i} style={styles.piece}>
                        {PIECE_UNICODE[c.piece] ?? '?'}
                    </span>
                ))}
                {captured.length === 0 && (
                    <span style={styles.empty}>—</span>
                )}
            </div>
            {totalValue > 0 && (
                <span style={styles.advantage}>+{totalValue}</span>
            )}
        </div>
    )
}

const styles = {
    container: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        minHeight: '32px',
        width: 'min(86vw, 520px)',
        padding: '4px 8px',
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderRadius: '6px',
    },
    label: {
        color: '#666',
        fontFamily: 'monospace',
        fontSize: '11px',
        letterSpacing: '1px',
        minWidth: '40px',
        userSelect: 'none',
    },
    pieces: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '1px',
        flex: 1,
    },
    piece: {
        fontSize: '18px',
        lineHeight: 1,
        userSelect: 'none',
        fontFamily: 'Segoe UI Symbol, Georgia, serif',
    },
    empty: {
        color: '#444',
        fontSize: '13px',
        fontFamily: 'monospace',
    },
    advantage: {
        color: '#9bbb59',
        fontFamily: 'monospace',
        fontSize: '13px',
        fontWeight: 700,
        minWidth: '28px',
        textAlign: 'right',
    },
}