import {
    toIndex,
    pieceType,
    pieceColor,
    isEmpty,
    Piece,
    Color,
} from '../engine/board.js';

export function isPathClear(fromRow, fromCol, toRow, toCol, board) {
  const rowStep = toRow === fromRow ? 0 : (toRow > fromRow ? 1 : -1);
  const colStep = toCol === fromCol ? 0 : (toCol > fromCol ? 1 : -1);

  let currentRow = fromRow + rowStep;
  let currentCol = fromCol + colStep;

  while (currentRow !== toRow || currentCol !== toCol) {
    if (!isEmpty(board[toIndex(currentRow, currentCol)])) {
      return false;
    }
    currentRow += rowStep;
    currentCol += colStep;
  }
  return true;
}