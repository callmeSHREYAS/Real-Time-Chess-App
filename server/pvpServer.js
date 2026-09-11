/* global process */
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import {
  Color,
  Piece,
  isEmpty,
  pieceColor,
  pieceType,
  setupStartingPosition,
  toIndex,
  toRowCol,
} from '../src/computer/engine/board.js'
import { applyMove } from '../src/computer/engine/applyMove.js'
import { isValidMove } from '../src/computer/engine/getMoveHelper/isValidMove.js'
import { checkGameStatus } from '../src/computer/checkSqrs/checkGameStatus .js'
import { DEFAULT_GAME_STATE, updateGameStateAfterMove } from '../src/computer/engine/gameState.js'

const PORT = process.env.PVP_PORT || 3001
const PROMOTION_TYPES = new Set([Piece.Queen, Piece.Rook, Piece.Bishop, Piece.Knight])
const FINISHED_STATUSES = new Set(['checkmate-white', 'checkmate-black', 'stalemate'])

const httpServer = createServer()
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  },
})

const waitingQueue = []
const games = new Map()

function otherColor(color) {
  return color === Color.White ? Color.Black : Color.White
}

function playerColor(game, socketId) {
  if (game.white.socketId === socketId) return Color.White
  if (game.black.socketId === socketId) return Color.Black
  return null
}

function stateForClient(game) {
  return {
    board: game.board,
    currentTurn: game.currentTurn,
    gameState: game.gameState,
    enPassantSquare: game.enPassantSquare,
    gameStatus: game.gameStatus,
    capturedWhite: game.capturedWhite,
    capturedBlack: game.capturedBlack,
  }
}

function addCapturedPiece(game, piece) {
  if (isEmpty(piece)) return

  if (pieceColor(piece) === Color.White) {
    game.capturedWhite.push({ piece })
  } else {
    game.capturedBlack.push({ piece })
  }
}

function leaveQueue(socketId) {
  const index = waitingQueue.findIndex(player => player.socketId === socketId)
  if (index !== -1) waitingQueue.splice(index, 1)
}

function startMatch(playerA, playerB) {
  const roomId = `room-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const aIsWhite = Math.random() < 0.5
  const white = aIsWhite ? playerA : playerB
  const black = aIsWhite ? playerB : playerA

  const game = {
    roomId,
    white,
    black,
    board: setupStartingPosition(),
    currentTurn: Color.White,
    gameState: DEFAULT_GAME_STATE,
    enPassantSquare: null,
    gameStatus: null,
    capturedWhite: [],
    capturedBlack: [],
  }

  games.set(roomId, game)

  for (const player of [white, black]) {
    const socket = io.sockets.sockets.get(player.socketId)
    if (!socket) continue
    socket.join(roomId)
    socket.data.roomId = roomId
    socket.data.color = player === white ? Color.White : Color.Black
  }

  io.to(white.socketId).emit('match:started', {
    roomId,
    yourColor: Color.White,
    whiteUsername: white.username,
    blackUsername: black.username,
    state: stateForClient(game),
  })

  io.to(black.socketId).emit('match:started', {
    roomId,
    yourColor: Color.Black,
    whiteUsername: white.username,
    blackUsername: black.username,
    state: stateForClient(game),
  })
}

function tryMatchPlayers() {
  while (waitingQueue.length >= 2) {
    const playerA = waitingQueue.shift()
    const playerB = waitingQueue.shift()
    startMatch(playerA, playerB)
  }
}

function applyValidatedMove(game, color, fromIdx, toIdx, promotionPieceType) {
  if (!Number.isInteger(fromIdx) || !Number.isInteger(toIdx) || fromIdx < 0 || fromIdx > 63 || toIdx < 0 || toIdx > 63) {
    return { ok: false, reason: 'Invalid board square.' }
  }

  const { row: fromRow, col: fromCol } = toRowCol(fromIdx)
  const { row: toRow, col: toCol } = toRowCol(toIdx)
  const movingPiece = game.board[fromIdx]
  const movingType = pieceType(movingPiece)

  if (FINISHED_STATUSES.has(game.gameStatus)) return { ok: false, reason: 'Game is already finished.' }
  if (game.currentTurn !== color) return { ok: false, reason: 'It is not your turn.' }
  if (isEmpty(movingPiece) || pieceColor(movingPiece) !== color) {
    return { ok: false, reason: 'That is not your piece.' }
  }
  if (!isValidMove(fromRow, fromCol, toRow, toCol, game.board, color, game.gameState, game.enPassantSquare)) {
    return { ok: false, reason: 'Illegal move.' }
  }

  let capturedPiece = game.board[toIdx]
  let nextBoard = applyMove(game.board, fromIdx, toIdx)
  let nextEnPassant = null
  const nextGameState = updateGameStateAfterMove(game.gameState, fromIdx, toIdx, game.board)

  if (movingType === Piece.King && Math.abs(toCol - fromCol) === 2) {
    const backRank = color === Color.White ? 0 : 7
    if (toCol === 6) {
      nextBoard = applyMove(nextBoard, toIndex(backRank, 7), toIndex(backRank, 5))
    } else if (toCol === 2) {
      nextBoard = applyMove(nextBoard, toIndex(backRank, 0), toIndex(backRank, 3))
    }
  }

  if (movingType === Piece.Pawn && toIdx === game.enPassantSquare) {
    const direction = color === Color.White ? -1 : 1
    const capturedIdx = toIndex(toRow + direction, toCol)
    capturedPiece = game.board[capturedIdx]
    nextBoard = [...nextBoard]
    nextBoard[capturedIdx] = Piece.None
  }

  if (movingType === Piece.Pawn && Math.abs(toRow - fromRow) === 2) {
    const direction = color === Color.White ? 1 : -1
    nextEnPassant = toIndex(fromRow + direction, fromCol)
  }

  if (movingType === Piece.Pawn && (toRow === 7 || toRow === 0)) {
    if (!PROMOTION_TYPES.has(promotionPieceType)) {
      return { ok: false, reason: 'Choose a valid promotion piece.' }
    }
    nextBoard = [...nextBoard]
    nextBoard[toIdx] = color | promotionPieceType
  }

  const nextTurn = otherColor(color)
  game.board = nextBoard
  game.currentTurn = nextTurn
  game.gameState = nextGameState
  game.enPassantSquare = nextEnPassant
  addCapturedPiece(game, capturedPiece)
  game.gameStatus = checkGameStatus(nextBoard, nextTurn, nextGameState, nextEnPassant)

  return { ok: true }
}

io.on('connection', socket => {
  socket.on('queue:join', payload => {
    const username = String(payload?.username || '').trim().slice(0, 24)
    if (!username) {
      socket.emit('queue:error', { message: 'Enter a username.' })
      return
    }

    leaveQueue(socket.id)
    socket.data.username = username
    waitingQueue.push({ socketId: socket.id, username })
    socket.emit('queue:waiting')
    tryMatchPlayers()
  })

  socket.on('queue:leave', () => {
    leaveQueue(socket.id)
  })

  socket.on('move:attempt', payload => {
    const roomId = String(payload?.roomId || '')
    const game = games.get(roomId)

    if (!game) {
      socket.emit('move:rejected', { reason: 'Game not found.' })
      return
    }

    const color = playerColor(game, socket.id)
    if (color === null) {
      socket.emit('move:rejected', { reason: 'Game not found.' })
      return
    }

    const result = applyValidatedMove(
      game,
      color,
      Number(payload.fromIdx),
      Number(payload.toIdx),
      Number(payload.promotionPieceType)
    )

    if (!result.ok) {
      socket.emit('move:rejected', { reason: result.reason })
      return
    }

    io.to(roomId).emit('game:state', stateForClient(game))
  })

  socket.on('disconnect', () => {
    leaveQueue(socket.id)

    const roomId = socket.data.roomId
    const game = games.get(roomId)
    if (!game) return

    socket.to(roomId).emit('opponent:left')
    games.delete(roomId)
  })
})

httpServer.listen(PORT, () => {
  console.log(`PVP Socket.IO server listening on http://localhost:${PORT}`)
})
