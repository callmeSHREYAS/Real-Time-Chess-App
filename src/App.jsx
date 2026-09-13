import { Routes, Route } from 'react-router-dom'
import ColorPicker from './computer/components/ColorPicker/ColorPicker'
import ModeSelector from './ModeSelector'
import PvpDashboard from './pvp/PvpDashboard'
import PvpFriendPlaceholder from './pvp/PvpFriendPlaceholder'
import PvpQuickMatch from './pvp/PvpQuickMatch'

import Game from './computer/components/Game/Game'


function App() {
  return (
    <Routes>
      <Route path="/" element={<ModeSelector />} />
      <Route path="/computer" element={<ColorPicker />} />
      <Route path="/chessboard" element={<Game />} />
      <Route path="/pvp" element={<PvpDashboard />} />
      <Route path="/pvp/friend" element={<PvpFriendPlaceholder />} />
      <Route path="/pvp/quick" element={<PvpQuickMatch />} />
    </Routes>
  )
}

export default App
