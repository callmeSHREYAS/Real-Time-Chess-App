export function isInBound(row, col) {
    if (row < 0 || row > 7 || col < 0 || col > 7) {
        return false;
    }
    return true
}