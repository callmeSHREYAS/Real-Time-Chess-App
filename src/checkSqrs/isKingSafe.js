import { toRowCol, pieceType, pieceColor, makePiece, Piece, Color } from '../engine/board.js';
import { isSquareAttacked } from './isSquareAttacked.js';

export function isKingSafe(board, color) {
    const kingValue = makePiece(Piece.King, color);
    const kingIndex = board.findIndex(square => square === kingValue);

    if (kingIndex === -1) return false;

    const { row: kingRow, col: kingCol } = toRowCol(kingIndex);
    return !isSquareAttacked(kingRow, kingCol, board, color);
}