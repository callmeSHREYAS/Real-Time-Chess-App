import { Routes, Route } from 'react-router-dom'
import ColorPicker from './components/ColorPicker/ColorPicker'
import Game from './components/Game/Game'

function App() {
  return (
    <Routes>
      <Route path="/"          element={<ColorPicker />} />
      <Route path="/chessboard" element={<Game />} />
    </Routes>
  )
}

export default App