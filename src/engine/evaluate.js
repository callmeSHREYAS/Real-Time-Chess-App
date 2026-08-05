import { pieceType, pieceColor, isEmpty, Piece, Color } from './board.js';

// ── Layer 1: Material Values (centipawns) ─────────────────────────────────────
const PIECE_VALUES = {
    [Piece.Pawn]:   100,
    [Piece.Knight]: 320,
    [Piece.Bishop]: 330,
    [Piece.Rook]:   500,
    [Piece.Queen]:  900,
    [Piece.King]:   20000,
}

// ── Layer 2: Piece-Square Tables ──────────────────────────────────────────────
// Each table is 64 values, index 0 = a1 (bottom-left), index 63 = h8 (top-right)
// Values are BONUSES on top of material — positive = good square for that piece
// Tables are written from WHITE's perspective (row 0 = white's back rank)

// Pawns — prefer center advance, punish staying on edges
const PAWN_TABLE = [
     0,   0,   0,   0,   0,   0,   0,   0,   // row 0 (rank 1) — can't be here normally
    50,  50,  50,  50,  50,  50,  50,  50,   // row 1 (rank 2) — starting row, neutral
    10,  10,  20,  30,  30,  20,  10,  10,   // row 2 (rank 3)
     5,   5,  10,  25,  25,  10,   5,   5,   // row 3 (rank 4)
     0,   0,   0,  20,  20,   0,   0,   0,   // row 4 (rank 5)
     5,  -5, -10,   0,   0, -10,  -5,   5,   // row 5 (rank 6)
     5,  10,  10, -20, -20,  10,  10,   5,   // row 6 (rank 7)
     0,   0,   0,   0,   0,   0,   0,   0,   // row 7 (rank 8) — promotion row
]

// Knights — strongly prefer center, terrible on edges ("a knight on the rim is dim")
const KNIGHT_TABLE = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20,   0,   0,   0,   0, -20, -40,
    -30,   0,  10,  15,  15,  10,   0, -30,
    -30,   5,  15,  20,  20,  15,   5, -30,
    -30,   0,  15,  20,  20,  15,   0, -30,
    -30,   5,  10,  15,  15,  10,   5, -30,
    -40, -20,   0,   5,   5,   0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
]

// Bishops — prefer long diagonals, avoid corners
const BISHOP_TABLE = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,  10,  10,   5,   0, -10,
    -10,   5,   5,  10,  10,   5,   5, -10,
    -10,   0,  10,  10,  10,  10,   0, -10,
    -10,  10,  10,  10,  10,  10,  10, -10,
    -10,   5,   0,   0,   0,   0,   5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
]

// Rooks — prefer open files (7th rank is powerful)
const ROOK_TABLE = [
     0,   0,   0,   0,   0,   0,   0,   0,
     5,  10,  10,  10,  10,  10,  10,   5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
    -5,   0,   0,   0,   0,   0,   0,  -5,
     0,   0,   0,   5,   5,   0,   0,   0,
]

// Queen — don't develop too early, avoid edges
const QUEEN_TABLE = [
    -20, -10, -10,  -5,  -5, -10, -10, -20,
    -10,   0,   0,   0,   0,   0,   0, -10,
    -10,   0,   5,   5,   5,   5,   0, -10,
     -5,   0,   5,   5,   5,   5,   0,  -5,
      0,   0,   5,   5,   5,   5,   0,  -5,
    -10,   5,   5,   5,   5,   5,   0, -10,
    -10,   0,   5,   0,   0,   0,   0, -10,
    -20, -10, -10,  -5,  -5, -10, -10, -20,
]

// King middlegame — hide behind pawns, avoid center
const KING_TABLE = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
     20,  20,   0,   0,   0,   0,  20,  20,
     20,  30,  10,   0,   0,  10,  30,  20,
]

// ── Table lookup helper ───────────────────────────────────────────────────────
const PIECE_TABLES = {
    [Piece.Pawn]:   PAWN_TABLE,
    [Piece.Knight]: KNIGHT_TABLE,
    [Piece.Bishop]: BISHOP_TABLE,
    [Piece.Rook]:   ROOK_TABLE,
    [Piece.Queen]:  QUEEN_TABLE,
    [Piece.King]:   KING_TABLE,
}

function getTableBonus(type, color, index) {
    const table = PIECE_TABLES[type]
    if (!table) return 0

    // White reads table normally (index 0 = a1 = bottom-left)
    // Black reads table mirrored vertically (their a1 is our a8)
    const tableIndex = color === Color.White
        ? index                    // white — use index as-is
        : 63 - index               // black — flip vertically

    return table[tableIndex]
}

// ── Main evaluate function ────────────────────────────────────────────────────
// Returns score from WHITE's perspective:
//   positive → white is winning
//   negative → black is winning
//   0        → equal

export function evaluate(board) {
    let score = 0

    for (let i = 0; i < 64; i++) {
        const piece = board[i]
        if (isEmpty(piece)) continue

        const type   = pieceType(piece)
        const color  = pieceColor(piece)

        // Layer 1: material value
        const material = PIECE_VALUES[type] ?? 0

        // Layer 2: position bonus from piece-square table
        const positional = getTableBonus(type, color, i)

        const pieceScore = material + positional

        // White pieces add to score, black pieces subtract
        if (color === Color.White) {
            score += pieceScore
        } else {
            score -= pieceScore
        }
    }

    return score
}