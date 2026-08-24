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
export function isValidBishopMove(fromRow, fromCol, toRow, toCol, board, color) {

    // ── 1. Bounds check ────────────────────────────────────────────────────────
    if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
        return false
    }

    // ── 2. Confirm piece is a bishop of the right color ───────────────────────
    let isValid = false
    const fromIdx = toIndex(fromRow, fromCol);
    const piece = board[fromIdx];
    if (pieceType(piece) !== Piece.Bishop) return false;
    if (pieceColor(piece) !== color) return false;

    // ── 3. Must be diagonal ───────────────────────────────────────────────────
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff !== colDiff || rowDiff === 0) return false;  // not diagonal or same square

    // ── 4. Path must be clear ─────────────────────────────────────────────────
    const rowStep = toRow > fromRow ? 1 : -1;  // which diagonal direction
    const colStep = toCol > fromCol ? 1 : -1;

    let currentRow = fromRow + rowStep;
    let currentCol = fromCol + colStep;

    while (currentRow !== toRow && currentCol !== toCol) {
        if (!isEmpty(board[toIndex(currentRow, currentCol)])) {
            return false;  // piece is blocking the path
        }
        currentRow += rowStep;
        currentCol += colStep;
    }

    // ── 5. Check destination square ───────────────────────────────────────────
    const toIdx = toIndex(toRow, toCol);
    const targetPiece = board[toIdx];

    if (isEmpty(targetPiece)) isValid = true;  // empty
    if (pieceColor(targetPiece) !== color) isValid = true;  // enemy → capture

    if (!isValid) return false;
    let tempBoard = [...board];
    tempBoard = applyMove(tempBoard, fromIdx, toIdx)
    return isKingSafe(tempBoard, color);
} 