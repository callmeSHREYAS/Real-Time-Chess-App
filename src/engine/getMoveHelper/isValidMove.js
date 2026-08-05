import { isValidBishopMove } from "../../validators/Bishop"
import { isValidKingMove } from "../../validators/King"
import { isValidKnightMove } from "../../validators/Knight"
import { isValidPawnMove } from "../../validators/Pawn"
import { isValidQueenMove } from "../../validators/Queen"
import { isValidRookMove } from "../../validators/Rook"
import { Piece, pieceColor, pieceType, toIndex } from "../board"

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
