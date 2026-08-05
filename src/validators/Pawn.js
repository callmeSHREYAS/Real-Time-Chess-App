import { isKingSafe } from '../checkSqrs/isKingSafe.js';
import { applyMove } from '../engine/applyMove.js';
import {
    toIndex,
    toRowCol,
    isEmpty,
    pieceType,
    pieceColor,
    makePiece,
    Piece,
    Color,
} from '../engine/board.js';
import { isInBound } from '../validateBound/isInBound.js';
/**
 * isValidPawnMove
 *
 * @param {number}   fromRow  - 0 (rank 1, white side) to 7 (rank 8, black side)
 * @param {number}   fromCol  - 0 (file a) to 7 (file h)
 * @param {number}   toRow
 * @param {number}   toCol
 * @param {number[]} board    - 64-element flat array
 * @param {number}   color    - Color.White or Color.Black
 * @param {number|null} enPassantSquare - flat index of en passant target, or null
 * @returns {boolean}
 */
export function isValidPawnMove(fromRow, fromCol, toRow, toCol, board, color, enPassantSquare = null) {

    // ── 1. Bounds check ────────────────────────────────────────────────────────
    if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
        return false
    }

    // ── 2. Confirm piece at fromSquare is actually a pawn ─────────────────────
    const fromIndex = toIndex(fromRow, fromCol);
    const piece = board[fromIndex];

    if (pieceType(piece) !== Piece.Pawn) return false;
    if (pieceColor(piece) !== color) return false;

    // ── 3. Pre-calculate deltas ────────────────────────────────────────────────
    let isValid = false;
    const toIdx = toIndex(toRow, toCol);
    const direction = color === Color.White ? 1 : -1;  // white goes +row, black goes -row
    const rowDiff = toRow - fromRow;                  // signed — direction matters here
    const colDiff = Math.abs(toCol - fromCol);        // unsigned — just distance

    // ── CASE 1: Single step forward ───────────────────────────────────────────
    if (colDiff === 0 && rowDiff === direction) {
        if (isEmpty(board[toIdx])) {
            isValid = true;
        }
    }

    // ── CASE 2: Double step forward (starting row only) ───────────────────────
    else if (colDiff === 0 && rowDiff === direction * 2) {
        const startingRow = color === Color.White ? 1 : 6;
        const skippedIndex = toIndex(fromRow + direction, fromCol); // square jumped over

        if (
            fromRow === startingRow &&
            isEmpty(board[skippedIndex]) &&  // can't jump over a piece
            isEmpty(board[toIdx])            // landing square must be empty
        ) {
            isValid = true;
        }
    }

    // ── CASE 3: Diagonal capture ──────────────────────────────────────────────
    else if (colDiff === 1 && rowDiff === direction) {
        const targetPiece = board[toIdx];
        const enemyColor = color === Color.White ? Color.Black : Color.White;

        if (!isEmpty(targetPiece) && pieceColor(targetPiece) === enemyColor) {
            isValid = true;
        }

        // ── CASE 4: En passant ──────────────────────────────────────────────────
        if (isEmpty(targetPiece) && enPassantSquare !== null && toIdx === enPassantSquare) {
            isValid = true;
        }
    }

    if (!isValid) return false;
    let tempBoard = [...board];
    tempBoard = applyMove(tempBoard,fromIndex, toIdx)
    if (colDiff === 1 && isEmpty(board[toIdx]) && toIdx === enPassantSquare) {
        const capturedPawnIdx = toIndex(toRow - direction, toCol); // pawn behind landing square
        tempBoard[capturedPawnIdx] = Piece.None;
    }
    
    return isKingSafe(tempBoard, color);




}