import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Meridian from './Meridian.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Meridian />
  </StrictMode>,
)
