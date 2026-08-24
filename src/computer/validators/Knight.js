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

export function isValidKnightMove(fromRow, fromCol, toRow, toCol, board, color) {

    // ── 1. Bounds check ────────────────────────────────────────────────────────
    if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
        return false
    }

    // ── 2. Confirm piece is a knight of the right color ───────────────────────
    const fromIdx = toIndex(fromRow, fromCol);
    const piece = board[fromIdx];
    let isValid = false

    if (pieceType(piece) !== Piece.Knight) return false;
    if (pieceColor(piece) !== color) return false;

    // ── 3. Check L-shape ──────────────────────────────────────────────────────
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    const isLShape = (rowDiff === 2 && colDiff === 1) ||
        (rowDiff === 1 && colDiff === 2);

    if (!isLShape) return false;

    // ── 4. Check destination square ───────────────────────────────────────────
    const toIdx = toIndex(toRow, toCol);
    const targetPiece = board[toIdx];

    if (isEmpty(targetPiece)) isValid = true;  // empty square
    if (pieceColor(targetPiece) !== color) isValid = true;  // enemy piece → capture
    /* pieceColor(targetPiece) === color (own piece) → fall through */

    if (!isValid) return false;
    let tempBoard = [...board];
    tempBoard = applyMove(tempBoard, fromIdx, toIdx)
    return isKingSafe(tempBoard, color);
}