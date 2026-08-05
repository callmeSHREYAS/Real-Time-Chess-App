import { Piece, Color } from '../../engine/board.js'

const PROMOTION_PIECES = [Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight]

const PIECE_UNICODE = {
    [Color.White | Piece.Queen]:  '♕',
    [Color.White | Piece.Rook]:   '♖',
    [Color.White | Piece.Bishop]: '♗',
    [Color.White | Piece.Knight]: '♘',
    [Color.Black | Piece.Queen]:  '♛',
    [Color.Black | Piece.Rook]:   '♜',
    [Color.Black | Piece.Bishop]: '♝',
    [Color.Black | Piece.Knight]: '♞',
}

const PIECE_NAMES = {
    [Piece.Queen]:  'Queen',
    [Piece.Rook]:   'Rook',
    [Piece.Bishop]: 'Bishop',
    [Piece.Knight]: 'Knight',
}

export default function PromotionModal({ color, onChoose }) {
    return (
        <div style={styles.overlay}>
            <div style={styles.modal}>
                <h3 style={styles.title}>Promote Pawn</h3>
                <p style={styles.subtitle}>Choose a piece</p>
                <div style={styles.options}>
                    {PROMOTION_PIECES.map(pieceType => (
                        <div
                            key={pieceType}
                            style={styles.option}
                            onClick={() => onChoose(pieceType)}
                        >
                            <span style={styles.piece}>
                                {PIECE_UNICODE[color | pieceType]}
                            </span>
                            <span style={styles.name}>
                                {PIECE_NAMES[pieceType]}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
    },
    modal: {
        backgroundColor: '#2a2a2a',
        border: '2px solid #b58863',
        borderRadius: '12px',
        padding: '28px 36px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    },
    title: {
        color: '#f0d9b5',
        fontFamily: 'Georgia, serif',
        fontSize: '22px',
        margin: 0,
    },
    subtitle: {
        color: '#888',
        fontFamily: 'monospace',
        fontSize: '13px',
        margin: 0,
    },
    options: {
        display: 'flex',
        gap: '16px',
    },
    option: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        padding: '16px',
        backgroundColor: '#3c2f24',
        border: '2px solid transparent',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        minWidth: '70px',
    },
    piece: {
        fontSize: '48px',
        lineHeight: 1,
        fontFamily: 'Segoe UI Symbol, Georgia, serif',
    },
    name: {
        color: '#f0d9b5',
        fontFamily: 'monospace',
        fontSize: '11px',
        letterSpacing: '1px',
    },
}