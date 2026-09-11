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
import { applyMove } from '../computer/engine/applyMove.js'
import { getLegalTargets } from '../computer/checkSqrs/getLegalTargets.js'
import { isValidMove } from '../computer/engine/getMoveHelper/isValidMove.js'
import { checkGameStatus } from '../computer/checkSqrs/checkGameStatus .js'
import { DEFAULT_GAME_STATE, updateGameStateAfterMove } from '../computer/engine/gameState.js'
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

function nextColor(color) {
    return color === Color.White ? Color.Black : Color.White
}

function addCapturedPiece(piece, setCapturedWhite, setCapturedBlack) {
    if (isEmpty(piece)) return

    if (pieceColor(piece) === Color.White) {
        setCapturedWhite(prev => [...prev, { piece }])
    } else {
        setCapturedBlack(prev => [...prev, { piece }])
    }
}

export default function PvpChessBoard({ initialBoard }) {
    const [board, setBoard] = useState(initialBoard)
    const [selected, setSelected] = useState(null)
    const [currentTurn, setCurrentTurn] = useState(Color.White)
    const [enPassantSquare, setEnPassantSquare] = useState(null)
    const [gameState, setGameState] = useState(DEFAULT_GAME_STATE)
    const [legalSquares, setLegalSquares] = useState([])
    const [gameStatus, setGameStatus] = useState(null)
    const [pendingPromotion, setPendingPromotion] = useState(null)
    const [capturedWhite, setCapturedWhite] = useState([])
    const [capturedBlack, setCapturedBlack] = useState([])

    function commitMove(nextBoard, nextTurn, nextGameState, nextEnPassant, capturedPiece) {
        const status = checkGameStatus(nextBoard, nextTurn, nextGameState, nextEnPassant)

        addCapturedPiece(capturedPiece, setCapturedWhite, setCapturedBlack)
        setGameStatus(status)
        setBoard(nextBoard)
        setEnPassantSquare(nextEnPassant)
        setGameState(nextGameState)
        setCurrentTurn(nextTurn)
        setSelected(null)
        setLegalSquares([])
    }

    function handleSquareClick(index) {
        if (pendingPromotion) return
        if (FINISHED_STATUSES.includes(gameStatus)) return

        const piece = board[index]

        if (selected === null) {
            if (isEmpty(piece) || pieceColor(piece) !== currentTurn) return
            setSelected(index)
            setLegalSquares(getLegalTargets(index, board, currentTurn, gameState, enPassantSquare))
            return
        }

        if (selected === index) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        if (!isEmpty(piece) && pieceColor(piece) === currentTurn) {
            setSelected(index)
            setLegalSquares(getLegalTargets(index, board, currentTurn, gameState, enPassantSquare))
            return
        }

        const { row: fromRow, col: fromCol } = toRowCol(selected)
        const { row: toRow, col: toCol } = toRowCol(index)

        if (!isValidMove(fromRow, fromCol, toRow, toCol, board, currentTurn, gameState, enPassantSquare)) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        const movingType = pieceType(board[selected])
        let capturedPiece = board[index]
        let nextBoard = applyMove(board, selected, index)
        let nextEnPassant = null
        const nextGameState = updateGameStateAfterMove(gameState, selected, index, board)

        if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
            const backRank = currentTurn === Color.White ? 0 : 7
            if (toCol === 6) {
                nextBoard = applyMove(nextBoard, toIndex(backRank, 7), toIndex(backRank, 5))
            } else if (toCol === 2) {
                nextBoard = applyMove(nextBoard, toIndex(backRank, 0), toIndex(backRank, 3))
            }
        }

        if (movingType === Piece.Pawn && index === enPassantSquare) {
            const direction = currentTurn === Color.White ? -1 : 1
            const capturedIdx = toIndex(toRow + direction, toCol)
            capturedPiece = board[capturedIdx]
            nextBoard = [...nextBoard]
            nextBoard[capturedIdx] = Piece.None
        }

        if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
            const direction = currentTurn === Color.White ? 1 : -1
            nextEnPassant = toIndex(fromRow + direction, fromCol)
        }

        const turnAfterMove = nextColor(currentTurn)
        if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
            setPendingPromotion({
                boardAfterMove: nextBoard,
                promotionIdx: index,
                color: currentTurn,
                nextTurn: turnAfterMove,
                nextEnPassant,
                nextGameState,
                capturedPiece,
            })
            return
        }

        commitMove(nextBoard, turnAfterMove, nextGameState, nextEnPassant, capturedPiece)
    }

    function handlePromotionChoice(chosenPieceType) {
        if (!pendingPromotion) return

        const nextBoard = [...pendingPromotion.boardAfterMove]
        nextBoard[pendingPromotion.promotionIdx] = pendingPromotion.color | chosenPieceType

        commitMove(
            nextBoard,
            pendingPromotion.nextTurn,
            pendingPromotion.nextGameState,
            pendingPromotion.nextEnPassant,
            pendingPromotion.capturedPiece
        )
        setPendingPromotion(null)
    }

    const squares = []
    for (let row = 7; row >= 0; row--) {
        for (let col = 0; col < 8; col++) {
            squares.push({ index: toIndex(row, col), row, col })
        }
    }

    return (
        <div style={styles.wrapper}>
            {pendingPromotion && (
                <PromotionModal color={pendingPromotion.color} onChoose={handlePromotionChoice} />
            )}

            <div style={styles.statusBar}>
                {!gameStatus && (
                    <span style={styles.statusNormal}>
                        {currentTurn === Color.White ? 'White to move' : 'Black to move'}
                    </span>
                )}
                {gameStatus === 'check-white' && (
                    <span style={styles.statusCheck}>White is in check</span>
                )}
                {gameStatus === 'check-black' && (
                    <span style={styles.statusCheck}>Black is in check</span>
                )}
                {gameStatus === 'checkmate-white' && (
                    <span style={styles.statusWin}>Checkmate - Black wins</span>
                )}
                {gameStatus === 'checkmate-black' && (
                    <span style={styles.statusWin}>Checkmate - White wins</span>
                )}
                {gameStatus === 'stalemate' && (
                    <span style={styles.statusDraw}>Stalemate - Draw</span>
                )}
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
                            onClick={() => handleSquareClick(index)}
                            style={{
                                ...styles.square,
                                backgroundColor: isSelected
                                    ? '#9bbb59'
                                    : isLight ? '#f0d9b5' : '#b58863',
                            }}
                        >
                            {col === 0 && (
                                <span style={{
                                    ...styles.rankLabel,
                                    color: isLight ? '#b58863' : '#f0d9b5',
                                }}>
                                    {row + 1}
                                </span>
                            )}

                            {row === 0 && (
                                <span style={{
                                    ...styles.fileLabel,
                                    color: isLight ? '#b58863' : '#f0d9b5',
                                }}>
                                    {FILES[col]}
                                </span>
                            )}

                            {isLegal && !hasEnemy && <span style={styles.legalDot} />}
                            {isLegal && hasEnemy && <span style={styles.captureRing} />}

                            {!isEmpty(piece) && (
                                <span style={{
                                    ...styles.piece,
                                    color: owner === Color.White ? '#ffffff' : '#111111',
                                    textShadow: owner === Color.White
                                        ? '0 1px 0 rgba(0,0,0,0.6)'
                                        : '0 1px 0 rgba(255,255,255,0.02)',
                                }}>
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
    wrapper: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
    },
    statusBar: {
        minHeight: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
        fontSize: '15px',
        letterSpacing: '1px',
    },
    statusNormal: {
        color: '#f0d9b5',
    },
    statusCheck: {
        color: '#f0a500',
        fontWeight: 700,
    },
    statusWin: {
        color: '#9bbb59',
        fontWeight: 700,
    },
    statusDraw: {
        color: '#c7c7c7',
        fontWeight: 700,
    },
    board: {
        width: 'min(86vw, 520px)',
        aspectRatio: '1 / 1',
        display: 'grid',
        gridTemplateColumns: 'repeat(8, 1fr)',
        gridTemplateRows: 'repeat(8, 1fr)',
        border: '10px solid #3c2f24',
        borderRadius: '8px',
        overflow: 'hidden',
        backgroundColor: '#3c2f24',
        boxShadow: '0 16px 40px rgba(0,0,0,0.45)',
    },
    square: {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 0,
        padding: 0,
        cursor: 'pointer',
    },
    piece: {
        fontSize: 'clamp(28px, 8vw, 56px)',
        lineHeight: 1,
        userSelect: 'none',
        position: 'relative',
        zIndex: 2,
        fontFamily: 'Segoe UI Symbol, "Noto Sans Symbols", "DejaVu Sans", Georgia, serif',
        filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.35))',
    },
    rankLabel: {
        position: 'absolute',
        top: '3px',
        left: '4px',
        fontSize: '12px',
        fontWeight: 700,
        userSelect: 'none',
        zIndex: 1,
    },
    fileLabel: {
        position: 'absolute',
        bottom: '3px',
        right: '4px',
        fontSize: '12px',
        fontWeight: 700,
        userSelect: 'none',
        zIndex: 1,
    },
    legalDot: {
        position: 'absolute',
        width: '28%',
        height: '28%',
        borderRadius: '50%',
        backgroundColor: 'rgba(25,25,25,0.28)',
        zIndex: 2,
    },
    captureRing: {
        position: 'absolute',
        width: '100%',
        height: '100%',
        borderRadius: '50%',
        border: '6px solid rgba(25,25,25,0.28)',
        boxSizing: 'border-box',
        zIndex: 2,
    },
}