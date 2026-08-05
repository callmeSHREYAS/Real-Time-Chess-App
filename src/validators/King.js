import {
    toIndex,
    pieceType,
    pieceColor,
    isEmpty,
    Piece,
    Color,
} from '../engine/board.js';
import { isInBound } from '../validateBound/isInBound.js';
import { isPathClear } from '../checkSqrs/isPathClear.js';
import { isSquareAttacked } from '../checkSqrs/isSquareAttacked.js';
import { applyMove } from '../engine/applyMove.js';
import { isKingSafe } from '../checkSqrs/isKingSafe.js';


export function isValidKingMove(fromRow, fromCol, toRow, toCol, board, color, gameState) {
    // gameState = { whiteKingMoved, blackKingMoved,
    //               whiteRookAMoved, whiteRookHMoved,
    //               blackRookAMoved, blackRookHMoved }

    // ── 1. Bounds check ──────────────────────────────────────────────────────
    if (!isInBound(fromRow, fromCol) || !isInBound(toRow, toCol)) {
        return false
    }

    // ── 2. Confirm piece is a king of the right color ─────────────────────────
    let isValid = false;
    const fromIdx = toIndex(fromRow, fromCol);
    const piece = board[fromIdx];

    if (pieceType(piece) !== Piece.King) return false;
    if (pieceColor(piece) !== color) return false;

    const rowDiff = toRow - fromRow;  // signed
    const colDiff = toCol - fromCol;  // signed

    // ── CASE 1: Normal one-square move ────────────────────────────────────────
    if (Math.abs(rowDiff) <= 1 && Math.abs(colDiff) <= 1 &&
        (rowDiff !== 0 || colDiff !== 0)) {

        const toIdx = toIndex(toRow, toCol);
        const targetPiece = board[toIdx];

        const destinationOk = isEmpty(targetPiece) ||
            pieceColor(targetPiece) !== color;

        if (!destinationOk) return false;

        // destination must not b   e under attack
        // if (isSquareAttacked(toRow, toCol, board, color)) return false;
        let tempBoard = [...board];
        tempBoard = applyMove(tempBoard, fromIdx, toIdx)
        return isKingSafe(tempBoard, color);
        
        // return true;
    }
    // Will do la6ter
    // // ── CASE 2: Castling ──────────────────────────────────────────────────────
    // if (Math.abs(rowDiff) === 0 && Math.abs(colDiff) === 2) {

    //     const kingMoved = color === Color.White
    //         ? gameState.whiteKingMoved
    //         : gameState.blackKingMoved;

    //     if (kingMoved) return false;  // king already moved

    //     // king must not currently be in check
    //     if (isSquareAttacked(fromRow, fromCol, board, color)) return false;

    //     const backRank = color === Color.White ? 0 : 7;
    //     const enemyColor = color === Color.White ? Color.Black : Color.White;

    //     // ── Kingside (col 4 → col 6) ──────────────────────────────────────────
    //     if (colDiff === 2) {
    //         const rookMoved = color === Color.White
    //             ? gameState.whiteRookHMoved
    //             : gameState.blackRookHMoved;

    //         if (rookMoved) return false;

    //         // squares between king and rook must be empty (f1, g1 for white)
    //         if (!isPathClear(backRank, 4, backRank, 7, board)) return false;

    //         // king must not pass through or land on attacked square
    //         if (isSquareAttacked(backRank, 5, board, color)) return false;
    //         if (isSquareAttacked(backRank, 6, board, color)) return false;

    //         return true;
    //     }

    //     // ── Queenside (col 4 → col 2) ─────────────────────────────────────────
    //     if (colDiff === -2) {
    //         const rookMoved = color === Color.White
    //             ? gameState.whiteRookAMoved
    //             : gameState.blackRookAMoved;

    //         if (rookMoved) return false;

    //         // squares between king and rook empty (b1, c1, d1 for white)
    //         if (!isPathClear(backRank, 4, backRank, 0, board)) return false;

    //         // king must not pass through or land on attacked square
    //         if (isSquareAttacked(backRank, 3, board, color)) return false;
    //         if (isSquareAttacked(backRank, 2, board, color)) return false;

    //         return true;
    //     }
    // }

    return false;
}
