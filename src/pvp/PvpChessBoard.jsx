import { useState } from 'react'
import {
    toIndex,
    toRowCol,
    pieceType,
    pieceColor,
    isEmpty,
    Piece,
    Color,
} from '../computer/engine/board.js'
import { getLegalTargets } from '../computer/checkSqrs/getLegalTargets.js'
import { isValidMove } from '../computer/engine/getMoveHelper/isValidMove.js'
import PromotionModal from '../computer/engine/PromotionModal/PromotionModal.jsx'
import CapturedPieces from '../computer/components/CapturedPieces/CapturedPieces.jsx'

const PIECE_UNICODE = {
    [Color.White | Piece.King]: '\u2654',
    [Color.White | Piece.Queen]: '\u2655',
    [Color.White | Piece.Rook]: '\u2656',
    [Color.White | Piece.Bishop]: '\u2657',
    [Color.White | Piece.Knight]: '\u2658',
    [Color.White | Piece.Pawn]: '\u2659',
    [Color.Black | Piece.King]: '\u265A',
    [Color.Black | Piece.Queen]: '\u265B',
    [Color.Black | Piece.Rook]: '\u265C',
    [Color.Black | Piece.Bishop]: '\u265D',
    [Color.Black | Piece.Knight]: '\u265E',
    [Color.Black | Piece.Pawn]: '\u265F',
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
const FINISHED_STATUSES = ['checkmate-white', 'checkmate-black', 'stalemate']

export default function PvpChessBoard({ snapshot, onSubmitMove, error }) {
    const [selected, setSelected] = useState(null)
    const [legalSquares, setLegalSquares] = useState([])
    const [pendingPromotion, setPendingPromotion] = useState(null)

    const {
        board,
        currentTurn,
        yourColor,
        gameState,
        enPassantSquare,
        gameStatus,
        capturedWhite,
        capturedBlack,
        yourName,
        opponentName,
    } = snapshot

    const canMove = currentTurn === yourColor && !FINISHED_STATUSES.includes(gameStatus)

    function selectSquare(index) {
        if (!canMove || pendingPromotion) return

        const piece = board[index]
        if (selected === null) {
            if (isEmpty(piece) || pieceColor(piece) !== yourColor) return
            setSelected(index)
            setLegalSquares(getLegalTargets(index, board, yourColor, gameState, enPassantSquare))
            return
        }

        if (selected === index) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        if (!isEmpty(piece) && pieceColor(piece) === yourColor) {
            setSelected(index)
            setLegalSquares(getLegalTargets(index, board, yourColor, gameState, enPassantSquare))
            return
        }

        const { row: fromRow, col: fromCol } = toRowCol(selected)
        const { row: toRow, col: toCol } = toRowCol(index)
        if (!isValidMove(fromRow, fromCol, toRow, toCol, board, yourColor, gameState, enPassantSquare)) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        if (pieceType(board[selected]) === Piece.Pawn && (toRow === 0 || toRow === 7)) {
            setPendingPromotion({ fromIdx: selected, toIdx: index })
            return
        }

        onSubmitMove({ fromIdx: selected, toIdx: index })
        setSelected(null)
        setLegalSquares([])
    }

    function choosePromotion(promotionType) {
        if (!pendingPromotion) return
        onSubmitMove({ ...pendingPromotion, promotionType })
        setPendingPromotion(null)
        setSelected(null)
        setLegalSquares([])
    }

    const squares = []
    if (yourColor === Color.White) {
        for (let row = 7; row >= 0; row--) {
            for (let col = 0; col < 8; col++) squares.push({ index: toIndex(row, col), row, col })
        }
    } else {
        for (let row = 0; row < 8; row++) {
            for (let col = 7; col >= 0; col--) squares.push({ index: toIndex(row, col), row, col })
        }
    }

    return (
        <div style={styles.wrapper}>
            {pendingPromotion && <PromotionModal color={yourColor} onChoose={choosePromotion} />}

            <div style={styles.players}>
                <span>{yourName} ({yourColor === Color.White ? 'White' : 'Black'})</span>
                <span>vs {opponentName}</span>
            </div>

            <div style={styles.statusBar}>
                {error && <span style={styles.statusCheck}>{error}</span>}
                {!error && !gameStatus && (
                    <span style={styles.statusNormal}>
                        {currentTurn === yourColor ? 'Your turn' : "Opponent's turn"}
                    </span>
                )}
                {gameStatus === 'check-white' && <span style={styles.statusCheck}>White is in check</span>}
                {gameStatus === 'check-black' && <span style={styles.statusCheck}>Black is in check</span>}
                {gameStatus === 'checkmate-white' && <span style={styles.statusWin}>Checkmate - Black wins</span>}
                {gameStatus === 'checkmate-black' && <span style={styles.statusWin}>Checkmate - White wins</span>}
                {gameStatus === 'stalemate' && <span style={styles.statusDraw}>Stalemate - Draw</span>}
            </div>

            <CapturedPieces captured={capturedBlack} playerColor={Color.White} label="White" />

            <div style={styles.board}>
                {squares.map(({ index, row, col }) => {
                    const piece = board[index]
                    const isLight = (row + col) % 2 === 1
                    const owner = !isEmpty(piece) ? pieceColor(piece) : null
                    const isSelected = selected === index
                    const isLegal = legalSquares.includes(index)
                    const hasEnemy = isLegal && !isEmpty(piece)

                    return (
                        <button
                            key={index}
                            type="button"
                            onClick={() => selectSquare(index)}
                            style={{
                                ...styles.square,
                                backgroundColor: isSelected ? '#9bbb59' : isLight ? '#f0d9b5' : '#b58863',
                            }}
                        >
                            {col === 0 && <span style={{ ...styles.rankLabel, color: isLight ? '#b58863' : '#f0d9b5' }}>{row + 1}</span>}
                            {row === 0 && <span style={{ ...styles.fileLabel, color: isLight ? '#b58863' : '#f0d9b5' }}>{FILES[col]}</span>}
                            {isLegal && !hasEnemy && <span style={styles.legalDot} />}
                            {isLegal && hasEnemy && <span style={styles.captureRing} />}
                            {!isEmpty(piece) && (
                                <span style={{ ...styles.piece, color: owner === Color.White ? '#ffffff' : '#111111' }}>
                                    {PIECE_UNICODE[piece] ?? '?'}
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>

            <CapturedPieces captured={capturedWhite} playerColor={Color.Black} label="Black" />
        </div>
    )
}

const styles = {
    wrapper: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' },
    players: { width: 'min(86vw, 520px)', display: 'flex', justifyContent: 'space-between', color: '#b8a58c', fontFamily: 'monospace', fontSize: '12px' },
    statusBar: { minHeight: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace', fontSize: '15px', letterSpacing: '1px' },
    statusNormal: { color: '#f0d9b5' },
    statusCheck: { color: '#f0a500', fontWeight: 700 },
    statusWin: { color: '#9bbb59', fontWeight: 700 },
    statusDraw: { color: '#c7c7c7', fontWeight: 700 },
    board: { width: 'min(86vw, 520px)', aspectRatio: '1 / 1', display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gridTemplateRows: 'repeat(8, 1fr)', border: '10px solid #3c2f24', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#3c2f24', boxShadow: '0 16px 40px rgba(0,0,0,0.45)' },
    square: { position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 0, padding: 0, cursor: 'pointer' },
    piece: { fontSize: 'clamp(28px, 8vw, 56px)', lineHeight: 1, userSelect: 'none', position: 'relative', zIndex: 2, fontFamily: 'Segoe UI Symbol, "Noto Sans Symbols", "DejaVu Sans", Georgia, serif', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))' },
    rankLabel: { position: 'absolute', top: '3px', left: '4px', fontSize: '12px', fontWeight: 700, userSelect: 'none', zIndex: 1 },
    fileLabel: { position: 'absolute', bottom: '3px', right: '4px', fontSize: '12px', fontWeight: 700, userSelect: 'none', zIndex: 1 },
    legalDot: { position: 'absolute', width: '28%', height: '28%', borderRadius: '50%', backgroundColor: 'rgba(25,25,25,0.28)', zIndex: 2 },
    captureRing: { position: 'absolute', width: '100%', height: '100%', borderRadius: '50%', border: '6px solid rgba(25,25,25,0.28)', boxSizing: 'border-box', zIndex: 2 },
}
