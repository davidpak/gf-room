import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { finishLogin } from './lib/spotify/auth'
import './styles.css'

// (/spotify is Spotify's login sending her back: the tokens are fetched and she's sent on, nothing drawn)
finishLogin().then((was) => {
  if (was) return
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
