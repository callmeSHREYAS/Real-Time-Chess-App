import { isInCheck } from "../../checkSqrs/isInCheck.js"
import { isKingSafe } from "../../checkSqrs/isKingSafe.js"
import { applyMove } from "../applyMove.js"
import { Color, isEmpty, Piece, pieceColor, pieceType, toIndex, toRowCol } from "../board.js"
import { evaluate } from "../evaluate.js"
import { updateGameStateAfterMove } from "../gameState.js"
import { getAllMoves } from "../getAllMoves/getAllMoves.js"



// ── Apply move + handle special cases (same logic as ChessBoard) ──────────────
function applyFullMove(board, fromIdx, toIdx, color, gameState, enPassantSquare) {
    let newBoard = applyMove(board, fromIdx, toIdx)
    let newEnPassant = null
    const newGameState = updateGameStateAfterMove(gameState, fromIdx, toIdx, board)

    const { row: fromRow, col: fromCol } = toRowCol(fromIdx)
    const { row: toRow, col: toCol } = toRowCol(toIdx)
    const movingType = pieceType(board[fromIdx])

    // castling — move rook too
    if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
        const backRank = color === Color.White ? 0 : 7
        if (toCol === 6) {
            newBoard = applyMove(newBoard, toIndex(backRank, 7), toIndex(backRank, 5))
        } else if (toCol === 2) {
            newBoard = applyMove(newBoard, toIndex(backRank, 0), toIndex(backRank, 3))
        }
    }

    // en passant — remove captured pawn
    if (movingType === Piece.Pawn && toIdx === enPassantSquare) {
        const direction = color === Color.White ? -1 : 1
        const capturedIdx = toIndex(toRow + direction, toCol)
        newBoard = [...newBoard]
        newBoard[capturedIdx] = Piece.None
    }

    // set en passant square for next turn
    if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
        const direction = color === Color.White ? 1 : -1
        newEnPassant = toIndex(fromRow + direction, fromCol)
    }

    // pawn promotion — auto queen
    if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
        newBoard = [...newBoard]
        newBoard[toIdx] = color | Piece.Queen
    }

    return { newBoard, newGameState, newEnPassant }
}

// in minimax.js, before the move loop
function orderMoves(moves, board) {
    return moves.sort((a, b) => {
        const targetA = board[a.toIdx]
        const targetB = board[b.toIdx]

        // MVV-LVA: Most Valuable Victim, Least Valuable Attacker
        // capture high value pieces with low value pieces first
        const captureScoreA = !isEmpty(targetA)
            ? CAPTURE_VALUES[pieceType(targetA)] - CAPTURE_VALUES[pieceType(board[a.fromIdx])] / 10
            : 0
        const captureScoreB = !isEmpty(targetB)
            ? CAPTURE_VALUES[pieceType(targetB)] - CAPTURE_VALUES[pieceType(board[b.fromIdx])] / 10
            : 0

        return captureScoreB - captureScoreA  // highest capture score first
    })
}

const CAPTURE_VALUES = {
    [Piece.Pawn]: 100,
    [Piece.Knight]: 320,
    [Piece.Bishop]: 330,
    [Piece.Rook]: 500,
    [Piece.Queen]: 900,
    [Piece.King]: 20000,
}

// ── Minimax with Alpha-Beta Pruning ───────────────────────────────────────────
// score is always from WHITE's perspective
// isMaximizing = true  → white's turn (wants highest score)
// isMaximizing = false → black's turn (wants lowest score)

export function minimax(board, depth, alpha, beta, isMaximizing, color, gameState, enPassantSquare) {

    // ── Base case: depth 0 → evaluate the position ────────────────────────────
    if (depth === 0) {
        return evaluate(board)
    }

    const moves = getAllMoves(board, color, gameState, enPassantSquare)
    const ordered = orderMoves(moves, board)  // ← add this


    // ── No moves available → checkmate or stalemate ───────────────────────────
    if (moves.length === 0) {
        if (isInCheck(board, color)) {
            // checkmate — worst possible outcome for the side that has no moves
            return isMaximizing ? -Infinity : Infinity
        } else {
            return 0  // stalemate — draw
        }
    }

    const enemyColor = color === Color.White ? Color.Black : Color.White

    if (isMaximizing) {
        let best = -Infinity

        for (const move of moves) {
            const { newBoard, newGameState, newEnPassant } = applyFullMove(
                board, move.fromIdx, move.toIdx, color, gameState, enPassantSquare
            )

            const score = minimax(
                newBoard,
                depth - 1,
                alpha,
                beta,
                false,          // next turn is minimizing (black)
                enemyColor,
                newGameState,
                newEnPassant
            )

            best = Math.max(best, score)
            alpha = Math.max(alpha, best)

            if (beta <= alpha) break  // ← beta cutoff (prune)
        }

        return best

    } else {
        let best = Infinity

        for (const move of moves) {
            const { newBoard, newGameState, newEnPassant } = applyFullMove(
                board, move.fromIdx, move.toIdx, color, gameState, enPassantSquare
            )

            const score = minimax(
                newBoard,
                depth - 1,
                alpha,
                beta,
                true,           // next turn is maximizing (white)
                enemyColor,
                newGameState,
                newEnPassant
            )

            best = Math.min(best, score)
            beta = Math.min(beta, best)

            if (beta <= alpha) break  // ← alpha cutoff (prune)
        }

        return best
    }
}
