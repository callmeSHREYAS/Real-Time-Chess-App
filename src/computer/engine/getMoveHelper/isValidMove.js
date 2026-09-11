import { isValidBishopMove } from "../../validators/Bishop.js"
import { isValidKingMove } from "../../validators/King.js"
import { isValidKnightMove } from "../../validators/Knight.js"
import { isValidPawnMove } from "../../validators/Pawn.js"
import { isValidQueenMove } from "../../validators/Queen.js"
import { isValidRookMove } from "../../validators/Rook.js"
import { Piece, pieceColor, pieceType, toIndex } from "../board.js"

export function isValidMove(fromRow, fromCol, toRow, toCol, board, color, gameState, enPassantSquare) {
    const type = pieceType(board[toIndex(fromRow, fromCol)])
    switch (type) {
        case Piece.Pawn: return isValidPawnMove(fromRow, fromCol, toRow, toCol, board, color, enPassantSquare)
        case Piece.Knight: return isValidKnightMove(fromRow, fromCol, toRow, toCol, board, color)
        case Piece.Bishop: return isValidBishopMove(fromRow, fromCol, toRow, toCol, board, color)
        case Piece.Rook: return isValidRookMove(fromRow, fromCol, toRow, toCol, board, color)
        case Piece.Queen: return isValidQueenMove(fromRow, fromCol, toRow, toCol, board, color)
        case Piece.King: return isValidKingMove(fromRow, fromCol, toRow, toCol, board, color, gameState)
        default: return false
    }
}
