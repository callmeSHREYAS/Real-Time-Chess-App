

import { getLegalTargets } from "../../checkSqrs/getLegalTargets"
import { isEmpty, pieceColor, toIndex, toRowCol } from "../board.js"
import { isValidMove } from "../getMoveHelper/isValidMove.js"




export function getAllMoves(board, color, gameState, enPassantSquare) {
    const moves = []

    for (let i = 0; i < 64; i++) {
        const piece = board[i]

        // skip empty squares and enemy pieces
        if (isEmpty(piece) || pieceColor(piece) !== color) continue
        const { row: fromRow, col: fromCol } = toRowCol(i)
        const targets = getLegalTargets(i, board, color, gameState, enPassantSquare)
        for (const toIdx of targets) {
            moves.push({ fromIdx: i, toIdx })
        }
    }

    return moves  // array of { fromIdx, toIdx }
}