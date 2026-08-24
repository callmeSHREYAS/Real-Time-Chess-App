import { isKingSafe } from '../checkSqrs/isKingSafe.js';
import { applyMove } from '../engine/applyMove.js';
import {
  toIndex,
  pieceType,
  pieceColor,
  isEmpty,
  Piece,
  Color,
} from '../engine/board.js';
import { isInBound } from '../validateBound/isInBound.js';
export function isValidRookMove(fromRow, fromCol, toRow, toCol, board, color) {

  // ── 1. Bounds check ────────────────────────────────────────────────────────
  if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
    return false
  }

  // ── 2. Confirm piece is a rook of the right color ─────────────────────────
  let isValid = false 
  const fromIdx = toIndex(fromRow, fromCol);
  const piece = board[fromIdx];

  if (pieceType(piece) !== Piece.Rook) return false;
  if (pieceColor(piece) !== color) return false;

  // ── 3. Must be straight line (not diagonal, not same square) ──────────────
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  const isStraight = (rowDiff === 0 && colDiff > 0) ||  // horizontal
    (colDiff === 0 && rowDiff > 0);     // vertical

  if (!isStraight) return false;

  // ── 4. Path must be clear ─────────────────────────────────────────────────
  const rowStep = toRow === fromRow ? 0 : (toRow > fromRow ? 1 : -1);
  const colStep = toCol === fromCol ? 0 : (toCol > fromCol ? 1 : -1);

  let currentRow = fromRow + rowStep;
  let currentCol = fromCol + colStep;

  while (currentRow !== toRow || currentCol !== toCol) {
    if (!isEmpty(board[toIndex(currentRow, currentCol)])) {
      return false;  // piece blocking the path
    }
    currentRow += rowStep;
    currentCol += colStep;
  }

  // ── 5. Check destination square ───────────────────────────────────────────
  const toIdx = toIndex(toRow, toCol);
  const targetPiece = board[toIdx];

  if (isEmpty(targetPiece)) isValid = true;  // empty square
  if (pieceColor(targetPiece) !== color) isValid = true;  // enemy → capture

  if (!isValid) return false;
  let tempBoard = [...board];
  tempBoard = applyMove(tempBoard, fromIdx, toIdx)
  return isKingSafe(tempBoard, color);
}