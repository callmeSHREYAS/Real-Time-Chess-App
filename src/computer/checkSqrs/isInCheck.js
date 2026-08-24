import { isKingSafe } from "./isKingSafe"

export function isInCheck(board, color) {
    return !isKingSafe(board, color)
}
