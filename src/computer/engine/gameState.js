import { Color, Piece, pieceColor, pieceType } from './board.js'

export const DEFAULT_GAME_STATE = {
    whiteKingMoved: false,
    blackKingMoved: false,
    whiteRookAMoved: false,
    whiteRookHMoved: false,
    blackRookAMoved: false,
    blackRookHMoved: false,
}

export function updateGameStateAfterMove(gameState, fromIndex, toIndex, board) {
    const piece = board[fromIndex]
    const capturedPiece = board[toIndex]
    const type = pieceType(piece)
    const color = pieceColor(piece)
    const updated = { ...DEFAULT_GAME_STATE, ...gameState }

    if (type === Piece.King) {
        if (color === Color.White) updated.whiteKingMoved = true
        else updated.blackKingMoved = true
    }

    if (type === Piece.Rook) {
        if (fromIndex === 0) updated.whiteRookAMoved = true
        if (fromIndex === 7) updated.whiteRookHMoved = true
        if (fromIndex === 56) updated.blackRookAMoved = true
        if (fromIndex === 63) updated.blackRookHMoved = true
    }

    if (pieceType(capturedPiece) === Piece.Rook) {
        if (toIndex === 0) updated.whiteRookAMoved = true
        if (toIndex === 7) updated.whiteRookHMoved = true
        if (toIndex === 56) updated.blackRookAMoved = true
        if (toIndex === 63) updated.blackRookHMoved = true
    }

    return updated
}
