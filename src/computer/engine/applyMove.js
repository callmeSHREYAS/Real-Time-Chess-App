import { Piece } from "./board.js"

export function applyMove(board, fromIndex, toIndex_) {
    const newBoard = [...board]
    newBoard[toIndex_] = newBoard[fromIndex]

    newBoard[fromIndex] = Piece.None
    return newBoard
}
