import { isKingSafe } from "./isKingSafe.js"

export function isInCheck(board, color) {
    return !isKingSafe(board, color)
}
