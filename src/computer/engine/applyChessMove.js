import { applyMove } from './applyMove.js'
import { Color, Piece, isEmpty, pieceColor, pieceType, toIndex, toRowCol } from './board.js'
import { checkGameStatus } from '../checkSqrs/checkGameStatus .js'
import { isValidMove } from './getMoveHelper/isValidMove.js'
import { updateGameStateAfterMove } from './gameState.js'

const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])

function isBoardIndex(value) {
    return Number.isInteger(value) && value >= 0 && value < 64
}

export function applyChessMove({
    board,
    currentTurn,
    fromIdx,
    toIdx,
    gameState,
    enPassantSquare,
    promotionType = null,
}) {
    if (!Array.isArray(board) || board.length !== 64) {
        return { ok: false, reason: 'Invalid board' }
    }

    if (!isBoardIndex(fromIdx) || !isBoardIndex(toIdx) || fromIdx === toIdx) {
        return { ok: false, reason: 'Invalid move coordinates' }
    }

    if (currentTurn !== Color.White && currentTurn !== Color.Black) {
        return { ok: false, reason: 'Invalid turn' }
    }

    const movingPiece = board[fromIdx]
    if (isEmpty(movingPiece) || pieceColor(movingPiece) !== currentTurn) {
        return { ok: false, reason: 'It is not this piece\'s turn' }
    }

    const { row: fromRow, col: fromCol } = toRowCol(fromIdx)
    const { row: toRow, col: toCol } = toRowCol(toIdx)

    if (!isValidMove(fromRow, fromCol, toRow, toCol, board, currentTurn, gameState, enPassantSquare)) {
        return { ok: false, reason: 'Illegal move' }
    }

    const movingType = pieceType(movingPiece)
    const capturedPiece = board[toIdx]
    let nextBoard = applyMove(board, fromIdx, toIdx)
    let nextEnPassantSquare = null

    if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
        const backRank = currentTurn === Color.White ? 0 : 7
        const rookFrom = toCol === 6 ? toIndex(backRank, 7) : toIndex(backRank, 0)
        const rookTo = toCol === 6 ? toIndex(backRank, 5) : toIndex(backRank, 3)
        nextBoard = applyMove(nextBoard, rookFrom, rookTo)
    }

    let actualCapturedPiece = capturedPiece
    if (movingType === Piece.Pawn && toIdx === enPassantSquare) {
        const direction = currentTurn === Color.White ? -1 : 1
        const capturedIdx = toIndex(toRow + direction, toCol)
        actualCapturedPiece = board[capturedIdx]
        nextBoard = [...nextBoard]
        nextBoard[capturedIdx] = Piece.None
    }

    if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
        const direction = currentTurn === Color.White ? 1 : -1
        nextEnPassantSquare = toIndex(fromRow + direction, fromCol)
    }

    const reachesPromotionRank = movingType === Piece.Pawn && (toRow === 0 || toRow === 7)
    if (reachesPromotionRank) {
        if (!PROMOTION_TYPES.has(promotionType)) {
            return { ok: false, reason: 'Promotion choice required' }
        }

        nextBoard = [...nextBoard]
        nextBoard[toIdx] = currentTurn | promotionType
    } else if (promotionType !== null) {
        return { ok: false, reason: 'Unexpected promotion choice' }
    }

    const nextGameState = updateGameStateAfterMove(gameState, fromIdx, toIdx, board)
    const nextTurn = currentTurn === Color.White ? Color.Black : Color.White
    const gameStatus = checkGameStatus(nextBoard, nextTurn, nextGameState, nextEnPassantSquare)

    return {
        ok: true,
        board: nextBoard,
        currentTurn: nextTurn,
        gameState: nextGameState,
        enPassantSquare: nextEnPassantSquare,
        gameStatus,
        capturedPiece: isEmpty(actualCapturedPiece) ? null : actualCapturedPiece,
        move: { fromIdx, toIdx, promotionType: reachesPromotionRank ? promotionType : null },
    }
}
