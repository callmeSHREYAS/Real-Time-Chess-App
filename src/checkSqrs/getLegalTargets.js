import { toIndex, toRowCol } from "../engine/board"
import { isValidMove } from "../engine/getMoveHelper/isValidMove"

export function getLegalTargets(fromIdx, board, color, gameState, enPassantSquare) {
    const { row: fromRow, col: fromCol } = toRowCol(fromIdx)
    const targets = []
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (isValidMove(fromRow, fromCol, r, c, board, color, gameState, enPassantSquare)) {
                targets.push(toIndex(r, c))
            }
        }
    }
    return targets
}