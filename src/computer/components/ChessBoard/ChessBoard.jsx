import { useState, useEffect, useRef } from 'react'
import {
    toIndex, toRowCol,
    pieceType, pieceColor,
    isEmpty, Piece, Color
} from '../../engine/board.js'

import { isValidPawnMove } from '../../validators/Pawn.js'
import { isValidKnightMove } from '../../validators/Knight.js'
import { isValidBishopMove } from '../../validators/Bishop.js'
import { isValidRookMove } from '../../validators/Rook.js'
import { isValidQueenMove } from '../../validators/Queen.js'
import { isValidKingMove } from '../../validators/King.js'
import { applyMove } from '../../engine/applyMove.js'
import { getLegalTargets } from '../../checkSqrs/getLegalTargets.js'
import { isValidMove } from '../../engine/getMoveHelper/isValidMove.js'
import { getAllMoves } from '../../engine/getAllMoves/getAllMoves.js'
import { getBestMove } from '../../engine/getBestMove/getBestMove.js'
import { checkGameStatus } from '../../checkSqrs/checkGameStatus .js'
import { DEFAULT_GAME_STATE, updateGameStateAfterMove } from '../../engine/gameState.js'
import PromotionModal from '../../engine/PromotionModal/PromotionModal.jsx'
import CapturedPieces from '../CapturedPieces/CapturedPieces.jsx'
// ── Piece unicode (explicit escapes to avoid encoding issues) ───────────────
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

// ── gameState for castling rights ────────────────────────────────────────────
// ── Update castling rights after a move ─────────────────────────────────────
export default function ChessBoard({ initialBoard, userColor, depth }) {
    const [board, setBoard] = useState(initialBoard)
    const [selected, setSelected] = useState(null)
    const [currentTurn, setCurrentTurn] = useState(Color.White)
    const [enPassantSquare, setEnPassantSquare] = useState(null)
    const [gameState, setGameState] = useState(DEFAULT_GAME_STATE)
    const [legalSquares, setLegalSquares] = useState([])
    const [gameStatus, setGameStatus] = useState(null)
    const aiColor = userColor === Color.White ? Color.Black : Color.White
    const [isAiThinking, setIsAiThinking] = useState(false)
    const [pendingPromotion, setPendingPromotion] = useState(null)
    // null | { boardAfterMove, index, newEnPassant, newGameState }


    //  For undo function
    const [moveHistory, setMoveHistory] = useState([])  // stack of { color, fromIdx, toIdx }
    const [capturedWhite, setCapturedWhite] = useState([]) // pieces captured FROM white (black took them)
    const [capturedBlack, setCapturedBlack] = useState([]) // pieces captured FROM black (white took them)

    // ── AI move trigger ───────────────────────────────────────────────────────
    const aiMoveInProgress = useRef(false)

    // store worker in a ref so you can cancel it
    const workerRef = useRef(null)

    useEffect(() => {
        if (currentTurn !== aiColor) return
        if (aiMoveInProgress.current) return
        if (gameStatus === 'checkmate-white' ||
            gameStatus === 'checkmate-black' ||
            gameStatus === 'stalemate') return

        aiMoveInProgress.current = true

        // ── Create worker ─────────────────────────────────────────────────────
        const worker = new Worker(
            new URL('../../engine/chessWorker/chessWorker.js', import.meta.url),
            { type: 'module' }
        )
        workerRef.current = worker  // ← store reference

        // ── Send board state to worker ────────────────────────────────────────
        setIsAiThinking(true)
        worker.postMessage({
            board,
            aiColor,
            gameState,
            enPassantSquare,
            depth,
        })

        // ── Receive result from worker ────────────────────────────────────────
        worker.onmessage = function (e) {
            const result = e.data

            if (!result) {
                aiMoveInProgress.current = false
                worker.terminate()
                return
            }

            const { fromIdx, toIdx } = result
            const { row: fromRow, col: fromCol } = toRowCol(fromIdx)
            const { row: toRow, col: toCol } = toRowCol(toIdx)

            let newBoard = applyMove(board, fromIdx, toIdx)
            let newEnPassant = null
            let newGameState = updateGameStateAfterMove(gameState, fromIdx, toIdx, board)
            const movingType = pieceType(board[fromIdx])

            // castling
            if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
                const backRank = aiColor === Color.White ? 0 : 7
                if (toCol === 6) newBoard = applyMove(newBoard, toIndex(backRank, 7), toIndex(backRank, 5))
                if (toCol === 2) newBoard = applyMove(newBoard, toIndex(backRank, 0), toIndex(backRank, 3))
            }

            // en passant
            if (movingType === Piece.Pawn && toIdx === enPassantSquare) {
                const direction = aiColor === Color.White ? -1 : 1
                const capturedIdx = toIndex(toRow + direction, toCol)
                newBoard = [...newBoard]
                newBoard[capturedIdx] = Piece.None
            }

            // en passant square for next turn
            if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
                const direction = aiColor === Color.White ? 1 : -1
                newEnPassant = toIndex(fromRow + direction, fromCol)
            }

            // pawn promotion
            if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
                newBoard = [...newBoard]
                newBoard[toIdx] = aiColor | Piece.Queen
            }

            const nextTurn = userColor
            const status = checkGameStatus(newBoard, nextTurn, newGameState, newEnPassant)

            // record captured piece before applying move
            const capturedPiece = board[toIdx]

            if (!isEmpty(capturedPiece)) {
                if (pieceColor(capturedPiece) === Color.White) {
                    setCapturedWhite(prev => [...prev, { piece: capturedPiece, lastIndex: toIdx }])
                } else {
                    setCapturedBlack(prev => [...prev, { piece: capturedPiece, lastIndex: toIdx }])
                }
            }

            setMoveHistory(prev => [...prev, {
                color: aiColor,
                fromIdx: fromIdx,
                toIdx: toIdx,
            }])

            setGameStatus(status)
            setBoard(newBoard)
            setEnPassantSquare(newEnPassant)
            setGameState(newGameState)
            setIsAiThinking(false)
            setCurrentTurn(userColor)
            setSelected(null)
            setLegalSquares([])

            aiMoveInProgress.current = false
            worker.terminate()  // ← clean up worker after each move
        }

        worker.onerror = function (err) {
            setIsAiThinking(false)
            console.error('Chess worker error:', err)
            aiMoveInProgress.current = false
            worker.terminate()
        }

        return () => {
            setIsAiThinking(false)
            worker.terminate()
            aiMoveInProgress.current = false
        }

    }, [currentTurn, depth])


    // ── Player click handler ──────────────────────────────────────────────────
    function handleSquareClick(index) {
        if (currentTurn !== userColor) return
        if (isAiThinking) return
        if (gameStatus === 'checkmate-white' ||
            gameStatus === 'checkmate-black' ||
            gameStatus === 'stalemate') return  // game over, no more moves


        const piece = board[index]

        // Case 1: nothing selected yet
        if (selected === null) {
            if (isEmpty(piece) || pieceColor(piece) !== currentTurn) return
            const targets = getLegalTargets(index, board, currentTurn, gameState, enPassantSquare)
            setSelected(index)
            setLegalSquares(targets)
            return
        }

        // Case 2: clicked same square — deselect
        if (selected === index) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        // Case 3: clicked own piece — switch selection
        if (!isEmpty(piece) && pieceColor(piece) === currentTurn) {
            const targets = getLegalTargets(index, board, currentTurn, gameState, enPassantSquare)
            setSelected(index)
            setLegalSquares(targets)
            return
        }

        // Case 4: attempt move
        const { row: fromRow, col: fromCol } = toRowCol(selected)
        const { row: toRow, col: toCol } = toRowCol(index)

        if (!isValidMove(fromRow, fromCol, toRow, toCol, board, currentTurn, gameState, enPassantSquare)) {
            setSelected(null)
            setLegalSquares([])
            return
        }

        let newBoard = applyMove(board, selected, index)
        let newEnPassant = null
        let newGameState = updateGameStateAfterMove(gameState, selected, index, board)

        const movingType = pieceType(board[selected])

        // castling — move rook too
        if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
            const backRank = currentTurn === Color.White ? 0 : 7
            if (toCol === 6) {
                newBoard = applyMove(newBoard, toIndex(backRank, 7), toIndex(backRank, 5))
            } else if (toCol === 2) {
                newBoard = applyMove(newBoard, toIndex(backRank, 0), toIndex(backRank, 3))
            }
        }

        // en passant — remove captured pawn
        if (movingType === Piece.Pawn && index === enPassantSquare) {
            const direction = currentTurn === Color.White ? -1 : 1
            const capturedIdx = toIndex(toRow + direction, toCol)
            newBoard = [...newBoard]
            newBoard[capturedIdx] = Piece.None
        }

        // set en passant square for next turn
        if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
            const direction = currentTurn === Color.White ? 1 : -1
            newEnPassant = toIndex(fromRow + direction, fromCol)
        }

        // pawn promotion — auto-queen for now
        // pawn promotion — show modal
        if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
            // store everything needed, wait for player to choose
            setPendingPromotion({
                boardAfterMove: newBoard,
                promotionIdx: index,
                newEnPassant,
                newGameState,
            })
            return  // ← don't commit state yet, wait for modal choice
        }


        // ── after player move, check status for the NEXT player's turn ───────────
        const nextTurn = currentTurn === Color.White ? Color.Black : Color.White
        const status = checkGameStatus(newBoard, nextTurn, newGameState, newEnPassant)

        // ── Record move in history ────────────────────────────────────────────────
        const capturedPiece = board[index]  // piece on destination BEFORE move

        // if a piece was captured, push to appropriate captured stack
        if (!isEmpty(capturedPiece)) {
            if (pieceColor(capturedPiece) === Color.White) {
                setCapturedWhite(prev => [...prev, { piece: capturedPiece, lastIndex: index }])
            } else {
                setCapturedBlack(prev => [...prev, { piece: capturedPiece, lastIndex: index }])
            }
        }

        // push move to history
        setMoveHistory(prev => [...prev, {
            color: currentTurn,
            fromIdx: selected,
            toIdx: index,
        }])


        setGameStatus(status)
        setBoard(newBoard)
        setEnPassantSquare(newEnPassant)
        setGameState(newGameState)
        setCurrentTurn(nextTurn)
        setSelected(null)
        setLegalSquares([])
    }
    function handlePromotionChoice(chosenPieceType) {
        if (!pendingPromotion) return

        const { boardAfterMove, promotionIdx, newEnPassant, newGameState } = pendingPromotion

        // apply chosen piece
        const newBoard = [...boardAfterMove]
        newBoard[promotionIdx] = currentTurn | chosenPieceType

        const nextTurn = currentTurn === Color.White ? Color.Black : Color.White
        const status = checkGameStatus(newBoard, nextTurn, newGameState, newEnPassant)

        setGameStatus(status)
        setBoard(newBoard)
        setEnPassantSquare(newEnPassant)
        setGameState(newGameState)
        setCurrentTurn(nextTurn)
        setSelected(null)
        setLegalSquares([])
        setPendingPromotion(null)  // close modal
    }

    function handleUndo() {
        // need at least 2 moves to undo (AI move + player move)
        // or 1 if player chose black (AI moved first)
        if (moveHistory.length === 0) return
        //if (isAiThinking) return  // don't undo while AI is thinking

        if (workerRef.current) {
            workerRef.current.terminate()
            workerRef.current = null
            setIsAiThinking(false)
            aiMoveInProgress.current = false  // ← reset lock too
        }

        // ── Pop last move ─────────────────────────────────────────────────────
        const history = [...moveHistory]
        const top = history.pop()
        setMoveHistory(history)

        // ── Reverse the move ──────────────────────────────────────────────────
        const newBoard = [...board]
        newBoard[top.fromIdx] = newBoard[top.toIdx]  // move piece back
        newBoard[top.toIdx] = Piece.None           // clear destination

        // ── Revive captured piece if any ──────────────────────────────────────
        const enemyColor = top.color === Color.White ? Color.Black : Color.White

        if (enemyColor === Color.White) {
            // white piece was captured — check white captured stack
            const whiteCaptured = [...capturedWhite]
            const top_captured = whiteCaptured[whiteCaptured.length - 1]

            if (top_captured && top_captured.lastIndex === top.toIdx) {
                newBoard[top.toIdx] = top_captured.piece  // revive piece
                whiteCaptured.pop()
                setCapturedWhite(whiteCaptured)
            }
        } else {
            // black piece was captured — check black captured stack
            const blackCaptured = [...capturedBlack]
            const top_captured = blackCaptured[blackCaptured.length - 1]

            if (top_captured && top_captured.lastIndex === top.toIdx) {
                newBoard[top.toIdx] = top_captured.piece  // revive piece
                blackCaptured.pop()
                setCapturedBlack(blackCaptured)
            }
        }

        // ── Restore turn and board ────────────────────────────────────────────
        setBoard(newBoard)
        setCurrentTurn(top.color)   // restore turn to whoever just moved
        setGameStatus(null)          // clear any checkmate/stalemate
        setSelected(null)
        setLegalSquares([])
    }


    // ── Build square render order based on player color ───────────────────────
    const squares = []
    if (userColor === Color.White) {
        for (let row = 7; row >= 0; row--) {
            for (let col = 0; col < 8; col++) {
                squares.push({ index: toIndex(row, col), row, col })
            }
        }
    } else {
        for (let row = 0; row <= 7; row++) {
            for (let col = 7; col >= 0; col--) {
                squares.push({ index: toIndex(row, col), row, col })
            }
        }
    }


    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={styles.statusBar}>
                {/* promotion modal — renders on top of everything */}
                {pendingPromotion && (
                    <PromotionModal
                        color={currentTurn}
                        onChoose={handlePromotionChoice}
                    />
                )}
                {!gameStatus && isAiThinking && (
                    <span style={styles.statusThinking}>🤖 AI thinking...</span>
                )}
                {!gameStatus && !isAiThinking && (
                    <span style={styles.statusNormal}>
                        {currentTurn === Color.White ? '⬜ White to move' : '⬛ Black to move'}
                    </span>
                )}
                {gameStatus === 'checkmate-white' && (
                    <span style={styles.statusLose}>
                        ♚ Checkmate — Black wins!
                    </span>
                )}
                {gameStatus === 'checkmate-black' && (
                    <span style={styles.statusWin}>
                        ♔ Checkmate — White wins!
                    </span>
                )}
                {gameStatus === 'stalemate' && (
                    <span style={styles.statusDraw}>
                        ½ Stalemate — Draw!
                    </span>
                )}
                {gameStatus === 'check-white' && !['checkmate-white', 'checkmate-black', 'stalemate'].includes(gameStatus) && (
                    <span style={styles.statusCheck}>
                        ⚠ White is in Check!
                    </span>
                )}
                {gameStatus === 'check-black' && !['checkmate-white', 'checkmate-black', 'stalemate'].includes(gameStatus) && (
                    <span style={styles.statusCheck}>
                        ⚠ Black is in Check!
                    </span>
                )}

            </div>
            <CapturedPieces
                captured={userColor === Color.White ? capturedBlack : capturedWhite}
                playerColor={userColor}
                label="You"
            />
            <div style={styles.board}>
                {squares.map(({ index, row, col }) => {
                    const piece = board[index]
                    const isLight = (row + col) % 2 === 1
                    const pieceOwner = !isEmpty(piece) ? pieceColor(piece) : null
                    const isSelected = selected === index
                    const isLegal = legalSquares.includes(index)
                    const hasEnemy = isLegal && !isEmpty(piece)

                    return (
                        <div
                            key={index}
                            onClick={() => handleSquareClick(index)}
                            style={{
                                ...styles.square,
                                backgroundColor: isSelected
                                    ? '#9bbb59'
                                    : isLight ? '#f0d9b5' : '#b58863',
                                cursor: 'pointer',
                            }}
                        >
                            {col === 0 && (
                                <span style={{
                                    ...styles.rankLabel,
                                    color: isLight ? '#b58863' : '#f0d9b5',
                                }}>{row + 1}</span>
                            )}

                            {row === 0 && (
                                <span style={{
                                    ...styles.fileLabel,
                                    color: isLight ? '#b58863' : '#f0d9b5',
                                }}>{FILES[col]}</span>
                            )}

                            {isLegal && !hasEnemy && (
                                <div style={styles.legalDot} />
                            )}

                            {isLegal && hasEnemy && (
                                <div style={styles.captureRing} />
                            )}

                            {!isEmpty(piece) && (
                                <span style={{
                                    ...styles.piece,
                                    color: pieceOwner === Color.White ? '#ffffff' : '#111111',
                                    textShadow: pieceOwner === Color.White
                                        ? '0 1px 0 rgba(0,0,0,0.6)'
                                        : '0 1px 0 rgba(255,255,255,0.02)'
                                }}>
                                    {PIECE_UNICODE[piece] ?? '?'}
                                </span>
                            )}
                        </div>
                    )
                })}
            </div>



            {/* ── Captured by AI (user pieces AI took) ── */}
            {/* If AI is black → AI captured white pieces → capturedWhite */}
            {/* If AI is white → AI captured black pieces → capturedBlack */}
            <CapturedPieces
                captured={aiColor === Color.Black ? capturedWhite : capturedBlack}
                playerColor={aiColor}
                label="AI"
            />



            {['checkmate-white', 'checkmate-black', 'stalemate'].includes(gameStatus) && (
                <div style={styles.gameOverBox}>
                    <div style={styles.gameOverText}>
                        {gameStatus === 'checkmate-white' && '♚ Black Wins!'}
                        {gameStatus === 'checkmate-black' && '♔ White Wins!'}
                        {gameStatus === 'stalemate' && '½ Draw — Stalemate'}
                    </div>
                    <button
                        style={styles.playAgainBtn}
                        onClick={() => window.location.href = '/computer'}
                    >
                        Play Again
                    </button>
                </div>
            )}
            <button
                onClick={handleUndo}
                // disabled={moveHistory.length === 0 || isAiThinking}
                // style={{
                //     ...styles.undoBtn,
                //     opacity: moveHistory.length === 0 || isAiThinking ? 0.4 : 1,
                //     cursor: moveHistory.length === 0 || isAiThinking ? 'not-allowed' : 'pointer',
                // }}
                disabled={moveHistory.length === 0}
                style={{
                    ...styles.undoBtn,
                    opacity: moveHistory.length === 0 ? 0.4 : 1,
                    cursor: moveHistory.length === 0 ? 'not-allowed' : 'pointer',
                }}
            >
                ↩ Undo
            </button>

        </div>
    )
}

const styles = {
    turnLabel: {
        textAlign: 'center',
        color: '#fff',
        fontSize: '16px',
        marginBottom: '10px',
        fontFamily: 'monospace',
        letterSpacing: '1px',
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
    statusThinking: {
        color: '#f0a500',
        fontFamily: 'monospace',
        fontSize: '15px',
        letterSpacing: '1px',
        animation: 'pulse 1s infinite',  // optional
    },
    undoBtn: {
        background: 'none',
        border: '1px solid #b58863',
        color: '#f0d9b5',
        padding: '8px 24px',
        borderRadius: '6px',
        fontFamily: 'monospace',
        fontSize: '14px',
        letterSpacing: '1px',
        marginTop: '8px',
    }
}
