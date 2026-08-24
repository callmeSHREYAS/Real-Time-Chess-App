import { getBestMove } from "../getBestMove/getBestMove.js"


// listen for message from main thread
self.onmessage = function (e) {
    const { board, aiColor, gameState, enPassantSquare, depth } = e.data

    const result = getBestMove(board, aiColor, gameState, enPassantSquare, depth)

    // post result back to main thread
    self.postMessage(result)
}
