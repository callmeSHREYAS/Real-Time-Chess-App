import { Routes, Route } from 'react-router-dom'
import ColorPicker from './computer/components/ColorPicker/ColorPicker'
import Game from './computer/components/Game/Game'
import ModeSelector from './ModeSelector'
import PvpDashboard from './pvp/PvpDashboard'
import PvpFriendPlaceholder from './pvp/PvpFriendPlaceholder'
import PvpQuickMatch from './pvp/PvpQuickMatch'

function App() {
  return (
    <Routes>
      <Route path="/" element={<ModeSelector />} />
      <Route path="/computer" element={<ColorPicker />} />
      <Route path="/pvp" element={<PvpDashboard />} />
      <Route path="/pvp/quick" element={<PvpQuickMatch />} />
      <Route path="/pvp/friend" element={<PvpFriendPlaceholder />} />
      <Route path="/chessboard" element={<Game />} />
    </Routes>
  )
}

export default App
