import { isValidPawnMove } from '../validators/Pawn.js';
import { isValidKnightMove } from '../validators/Knight.js';
import { isValidBishopMove } from '../validators/Bishop.js';
import { isValidRookMove } from '../validators/Rook.js';
import { isValidQueenMove } from '../validators/Queen.js';
import { isValidKingMove } from '../validators/King.js';

import {
  toRowCol,
  pieceType,
  pieceColor,
  isEmpty,
  Piece,
  Color
} from '../engine/board.js';
/**
 * Returns true if the given square is attacked by ANY enemy piece
 */
export function isSquareAttacked(row, col, board, friendlyColor) {
  const enemyColor = friendlyColor === Color.White ? Color.Black : Color.White;

  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (isEmpty(piece) || pieceColor(piece) !== enemyColor) continue;

    const { row: eRow, col: eCol } = toRowCol(i);
    const type = pieceType(piece);

    switch (type) {
      case Piece.Pawn:
        if (isValidPawnMove(eRow, eCol, row, col, board, enemyColor)) return true;
        break;
      case Piece.Knight:
        if (isValidKnightMove(eRow, eCol, row, col, board, enemyColor)) return true;
        break;
      case Piece.Bishop:
        if (isValidBishopMove(eRow, eCol, row, col, board, enemyColor)) return true;
        break;
      case Piece.Rook:
        if (isValidRookMove(eRow, eCol, row, col, board, enemyColor)) return true;
        break;
      case Piece.Queen:
        if (isValidQueenMove(eRow, eCol, row, col, board, enemyColor)) return true;
        break;
      case Piece.King:
        // recursion
        // if (isValidKingMove(eRow, eCol, row, col, board, enemyColor)) return true;
        const rowDiff = Math.abs(eRow - row)
        const colDiff = Math.abs(eCol - col)
        if (rowDiff <= 1 && colDiff <= 1 && (rowDiff + colDiff > 0)) return true

        break;
      // King attacks handled separately to avoid circular reference
    }
  }
  return false;
}
