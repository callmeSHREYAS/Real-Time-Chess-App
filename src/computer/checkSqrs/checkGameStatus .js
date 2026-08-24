import { Color } from "../engine/board"
import { getAllMoves } from "../engine/getAllMoves/getAllMoves"
import { isInCheck } from "./isInCheck"

export function checkGameStatus(board, currentTurn, gameState, enPassantSquare) {
    const moves = getAllMoves(board, currentTurn, gameState, enPassantSquare)
    const inCheck = isInCheck(board, currentTurn)

    if (moves.length === 0 && inCheck) {
        // the side whose turn it is has no moves and is in check → they LOSE
        return currentTurn === Color.White ? 'checkmate-white' : 'checkmate-black'
    }

    if (moves.length === 0 && !inCheck) {
        return 'stalemate'
    }

    if (inCheck) {
        // has moves but is in check
        return currentTurn === Color.White ? 'check-white' : 'check-black'
    }

    return null  // normal game
}
