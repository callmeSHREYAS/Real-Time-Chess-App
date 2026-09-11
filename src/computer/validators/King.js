import {
    toIndex,
    pieceType,
    pieceColor,
    isEmpty,
    makePiece,
    Piece,
    Color,
} from '../engine/board.js';
import { isInBound } from '../validateBound/isInBound.js';
import { isPathClear } from '../checkSqrs/isPathClear.js';
import { isSquareAttacked } from '../checkSqrs/isSquareAttacked.js';
import { applyMove } from '../engine/applyMove.js';
import { isKingSafe } from '../checkSqrs/isKingSafe.js';

export function isValidKingMove(fromRow, fromCol, toRow, toCol, board, color, gameState) {
    if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
        return false
    }

    const fromIdx = toIndex(fromRow, fromCol)
    const piece = board[fromIdx]

    if (pieceType(piece) !== Piece.King) return false
    if (pieceColor(piece) !== color) return false

    const rowDiff = toRow - fromRow
    const colDiff = toCol - fromCol

    if (Math.abs(rowDiff) <= 1 && Math.abs(colDiff) <= 1 &&
        (rowDiff !== 0 || colDiff !== 0)) {

        const toIdx = toIndex(toRow, toCol)
        const targetPiece = board[toIdx]

        const destinationOk = isEmpty(targetPiece) ||
            pieceColor(targetPiece) !== color

        if (!destinationOk) return false

        let tempBoard = [...board]
        tempBoard = applyMove(tempBoard, fromIdx, toIdx)
        return isKingSafe(tempBoard, color)
    }

    if (rowDiff === 0 && Math.abs(colDiff) === 2) {
        const state = gameState || {}
        const backRank = color === Color.White ? 0 : 7
        if (fromRow !== backRank || toRow !== backRank || fromCol !== 4) return false

        const kingMoved = color === Color.White
            ? state.whiteKingMoved
            : state.blackKingMoved
        if (kingMoved) return false

        const isKingside = colDiff === 2
        const rookCol = isKingside ? 7 : 0
        const throughCol = isKingside ? 5 : 3
        const rookMoved = color === Color.White
            ? (isKingside ? state.whiteRookHMoved : state.whiteRookAMoved)
            : (isKingside ? state.blackRookHMoved : state.blackRookAMoved)

        if (rookMoved) return false
        if (!isEmpty(board[toIndex(toRow, toCol)])) return false
        if (board[toIndex(backRank, rookCol)] !== makePiece(Piece.Rook, color)) return false
        if (!isPathClear(backRank, 4, backRank, rookCol, board)) return false

        if (isSquareAttacked(backRank, 4, board, color)) return false
        if (isSquareAttacked(backRank, throughCol, board, color)) return false
        if (isSquareAttacked(backRank, toCol, board, color)) return false

        return true
    }

    return false
}
