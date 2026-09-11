// import { getAllMoves } from './getAllMoves/getAllMoves.js'
// import { minimax } from './minimax.js'
// import { applyMove } from './applyMove.js'
// import { pieceType, toIndex, toRowCol, Piece, Color } from './board.js'

import { applyMove } from "../applyMove.js"
import { Color, Piece, pieceType, toIndex, toRowCol } from "../board.js"
import { updateGameStateAfterMove } from "../gameState.js"
import { getAllMoves } from "../getAllMoves/getAllMoves.js"
import { minimax } from "../minimax/minimax.js"

export function getBestMove(board, aiColor, gameState, enPassantSquare, depth = 3) {

    const moves = getAllMoves(board, aiColor, gameState, enPassantSquare)

    if (moves.length === 0) return null  // no moves → game over

    let bestMove  = null
    let bestScore = aiColor === Color.White ? -Infinity : Infinity

    const isMaximizing = aiColor === Color.White  // white maximizes, black minimizes
    const enemyColor   = aiColor === Color.White ? Color.Black : Color.White

    for (const move of moves) {
        // apply move to temp board
        let newBoard = applyMove(board, move.fromIdx, move.toIdx)
        let newEnPassant = null
        const newGameState = updateGameStateAfterMove(gameState, move.fromIdx, move.toIdx, board)

        const { row: fromRow, col: fromCol } = toRowCol(move.fromIdx)
        const { row: toRow,   col: toCol   } = toRowCol(move.toIdx)
        const movingType = pieceType(board[move.fromIdx])

        // handle special moves
        if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
            const backRank = aiColor === Color.White ? 0 : 7
            if (toCol === 6) newBoard = applyMove(newBoard, toIndex(backRank, 7), toIndex(backRank, 5))
            if (toCol === 2) newBoard = applyMove(newBoard, toIndex(backRank, 0), toIndex(backRank, 3))
        }
        if (movingType === Piece.Pawn && move.toIdx === enPassantSquare) {
            const direction   = aiColor === Color.White ? -1 : 1
            const capturedIdx = toIndex(toRow + direction, toCol)
            newBoard = [...newBoard]
            newBoard[capturedIdx] = Piece.None
        }
        if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
            const direction = aiColor === Color.White ? 1 : -1
            newEnPassant = toIndex(fromRow + direction, fromCol)
        }
        if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
            newBoard = [...newBoard]
            newBoard[move.toIdx] = aiColor | Piece.Queen
        }

        // score this move
        const score = minimax(
            newBoard,
            depth - 1,
            -Infinity,
            Infinity,
            !isMaximizing,  // next turn is opponent
            enemyColor,
            newGameState,
            newEnPassant
        )

        // pick best
        if (aiColor === Color.White && score > bestScore) {
            bestScore = score
            bestMove  = move
        }
        if (aiColor === Color.Black && score < bestScore) {
            bestScore = score
            bestMove  = move
        }
    }

    return bestMove  // { fromIdx, toIdx } — same shape as makeRandomMove
}
