import { isKingSafe } from '../checkSqrs/isKingSafe.js';
import { isPathClear } from '../checkSqrs/isPathClear.js';
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

export function isValidQueenMove(fromRow, fromCol, toRow, toCol, board, color) {

  // ── 1. Bounds check ──────────────────────────────────────────────────────
  if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
    return false
  }

  // ── 2. Confirm piece is a queen of the right color ────────────────────────
  const fromIdx = toIndex(fromRow, fromCol);
  const piece = board[fromIdx];
  let isValid = false;

  if (pieceType(piece) !== Piece.Queen) return false;
  if (pieceColor(piece) !== color) return false;

  // ── 3. Calculate diffs ────────────────────────────────────────────────────
  const rowDiff = Math.abs(toRow - fromRow);
  const colDiff = Math.abs(toCol - fromCol);

  const isDiagonal = rowDiff === colDiff && rowDiff !== 0;
  const isStraight = (rowDiff === 0 && colDiff > 0) ||
    (colDiff === 0 && rowDiff > 0);

  if (!isDiagonal && !isStraight) return false;  // invalid shape

  // ── 4. Path must be clear ─────────────────────────────────────────────────
  if (!isPathClear(fromRow, fromCol, toRow, toCol, board)) return false;
  isPathClear
  // ── 5. Check destination ──────────────────────────────────────────────────
  const toIdx = toIndex(toRow, toCol);
  const targetPiece = board[toIdx];

  if (isEmpty(targetPiece)) isValid = true;  // empty
  if (pieceColor(targetPiece) !== color) isValid = true;  // enemy → capture

  if (!isValid) return false;
  let tempBoard = [...board];
  tempBoard = applyMove(tempBoard, fromIdx, toIdx)
  return isKingSafe(tempBoard, color);
}