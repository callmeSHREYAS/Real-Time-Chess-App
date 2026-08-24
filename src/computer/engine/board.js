// ─── Piece Type Constants ───────────────────────────────────────────────────
export const Piece = {
  None:   0,
  King:   1,
  Pawn:   2,
  Knight: 3,
  Bishop: 4,
  Rook:   5,
  Queen:  6,
};

export const Color = {
  White: 8,
  Black: 16,
};

// ─── Piece Helpers ──────────────────────────────────────────────────────────
export function makePiece(type, color) {
  return type | color;
}

export function pieceType(piece) {
  return piece & 0b00111;
}

export function pieceColor(piece) {
  return piece & 0b11000;
}

export function isWhite(piece)  { return pieceColor(piece) === Color.White; }
export function isBlack(piece)  { return pieceColor(piece) === Color.Black; }
export function isEmpty(piece)  { return piece === Piece.None; }

// ─── Coordinate Helpers ─────────────────────────────────────────────────────

// row 0 = rank 1 (bottom), col 0 = file a (left)
export function toIndex(row, col) {
  return row * 8 + col;
}

export function toRowCol(index) {
  return {
    row: Math.floor(index / 8),  // 0 = bottom rank
    col: index % 8,              // 0 = left file
  };
}

// "e1" → index 4,  "a1" → 0,  "h8" → 63
export function algebraicToIndex(square) {
  const col = square.charCodeAt(0) - 'a'.charCodeAt(0); // a=0 ... h=7
  const row = parseInt(square[1]) - 1;                   // rank 1 = row 0
  return toIndex(row, col);
}

export function indexToAlgebraic(index) {
  const { row, col } = toRowCol(index);
  return String.fromCharCode('a'.charCodeAt(0) + col) + (row + 1);
}

// ─── Board ──────────────────────────────────────────────────────────────────
export function createEmptyBoard() {
  return new Array(64).fill(Piece.None);
}

// ─── Starting Position ──────────────────────────────────────────────────────
export function setupStartingPosition() {
  const board = createEmptyBoard();
  const W = Color.White;
  const B = Color.Black;
  const P = Piece;

  // White back rank (row 0, indices 0–7)
  board[algebraicToIndex('a1')] = makePiece(P.Rook,   W);
  board[algebraicToIndex('b1')] = makePiece(P.Knight, W);
  board[algebraicToIndex('c1')] = makePiece(P.Bishop, W);
  board[algebraicToIndex('d1')] = makePiece(P.Queen,  W);
  board[algebraicToIndex('e1')] = makePiece(P.King,   W);
  board[algebraicToIndex('f1')] = makePiece(P.Bishop, W);
  board[algebraicToIndex('g1')] = makePiece(P.Knight, W);
  board[algebraicToIndex('h1')] = makePiece(P.Rook,   W);

  // White pawns (row 1, indices 8–15)
  for (let col = 0; col < 8; col++) {
    board[toIndex(1, col)] = makePiece(P.Pawn, W);
  }

  // Black pawns (row 6, indices 48–55)
  for (let col = 0; col < 8; col++) {
    board[toIndex(6, col)] = makePiece(P.Pawn, B);
  }

  // Black back rank (row 7, indices 56–63)
  board[algebraicToIndex('a8')] = makePiece(P.Rook,   B);
  board[algebraicToIndex('b8')] = makePiece(P.Knight, B);
  board[algebraicToIndex('c8')] = makePiece(P.Bishop, B);
  board[algebraicToIndex('d8')] = makePiece(P.Queen,  B);
  board[algebraicToIndex('e8')] = makePiece(P.King,   B);
  board[algebraicToIndex('f8')] = makePiece(P.Bishop, B);
  board[algebraicToIndex('g8')] = makePiece(P.Knight, B);
  board[algebraicToIndex('h8')] = makePiece(P.Rook,   B);

  return board;
}