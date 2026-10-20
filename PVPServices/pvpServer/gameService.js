import { applyChessMove } from '../../src/computer/engine/applyChessMove.js'
import { Color, Piece } from '../../src/computer/engine/board.js'

const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])

export function submitMove(game, playerColor, payload) {
    if (game.gameStatus === 'checkmate-white' || game.gameStatus === 'checkmate-black' || game.gameStatus === 'stalemate') {
        return { ok: false, reason: 'The game is already over' }
    }

    if (game.currentTurn !== playerColor) {
        return { ok: false, reason: 'It is not your turn' }
    }

    const fromIdx = Number(payload?.fromIdx)
    const toIdx = Number(payload?.toIdx)
    const movingPiece = game.board[fromIdx]
    const reachesPromotionRank = movingPiece && (movingPiece & 0b00111) === Piece.Pawn && (toIdx < 8 || toIdx >= 56)
    const promotionType = payload?.promotionType ?? null

    if (reachesPromotionRank && !PROMOTION_TYPES.has(promotionType)) {
        return { ok: false, reason: 'Choose a promotion piece' }
    }

    const result = applyChessMove({
        board: game.board,
        currentTurn: game.currentTurn,
        fromIdx,
        toIdx,
        gameState: game.gameState,
        enPassantSquare: game.enPassantSquare,
        promotionType,
    })

    if (!result.ok) {
        return result
    }

    game.board = result.board
    game.currentTurn = result.currentTurn
    game.gameState = result.gameState
    game.enPassantSquare = result.enPassantSquare
    game.gameStatus = result.gameStatus

    if (result.capturedPiece) {
        const capturedList = (result.capturedPiece & 0b11000) === Color.White
            ? game.capturedWhite
            : game.capturedBlack
        capturedList.push({ piece: result.capturedPiece })
    }

    return { ok: true }
}