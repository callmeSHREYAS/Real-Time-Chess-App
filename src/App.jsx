import { Routes, Route } from 'react-router-dom'
import ColorPicker from './computer/components/ColorPicker/ColorPicker'
import Game from './computer/components/Game/Game'
import ModeSelector from './ModeSelector'
import PvpDashboard from './pvp/PvpDashboard'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ModeSelector />} />
      <Route path="/computer" element={<ColorPicker />} />
      <Route path="/pvp" element={<PvpDashboard />} />
      <Route path="/chessboard" element={<Game />} />
    </Routes>
  )
}

export default App
