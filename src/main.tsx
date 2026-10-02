import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { finishLogin } from './lib/spotify/auth'
import './styles.css'

// localhost and 127.0.0.1 are the same server but, to the browser, different sites: Spotify only sends logins back to
// 127.0.0.1 (and what she logs in with is kept per site), so localhost is sent over to 127.0.0.1.
// /spotify is Spotify's login sending her back: the tokens are fetched and she's sent on, nothing drawn.
if (location.hostname === 'localhost') location.replace(location.href.replace('//localhost', '//127.0.0.1'))
else
  finishLogin().then((was) => {
    if (was) return
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
