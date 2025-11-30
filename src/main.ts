import { Howl } from 'howler'
import isMobile from 'is-mobile'
import './style.css'

console.log(`%c
888             d8b                 
888             Y8P                 
888                                 
88888b.  .d88b. 88888888b.  .d88b.  
888 "88bd88""88b888888 "88bd88P"88b 
888  888888  888888888  888888  888 
888 d88PY88..88P888888  888Y88b 888 
88888P"  "Y88P" 888888  888 "Y88888 
                                888 
                           Y8b d88P 

https://github.com/gregsadetsky/boing`, 'font-family: monospace; white-space: pre;')

const API_URL = import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? 'https://respected-accordion-31461.ondis.co' : '')

// Global boing count from server
let globalBoingCount: number | null = null

// Detect mobile (for audio unlock overlay)
const isMobileDevice = isMobile()

// Setup DOM
const app = document.querySelector<HTMLDivElement>('#app')!
app.innerHTML = `
  ${isMobileDevice ? `
  <div id="mobileOverlay">
    <button id="mobileStartBtn">start boinging<br><span id="muteHint">(make sure to unmute your device)</span></button>
  </div>
  ` : ''}
  <div id="canvasWrapper">
    <canvas id="canvas"></canvas>
  </div>
  <div class="ui-layer">
    <div id="boingCount">you've boinged 0 times</div>
    <div id="globalBoingCount">the world has boinged ? times</div>
    <div id="footerLinks"><label><input type="checkbox" id="heatmapToggle"> boing heatmap</label> • <a href="https://github.com/gregsadetsky/boing" target="_blank">github</a></div>
  </div>
`

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const boingCountEl = document.getElementById('boingCount')!
const globalBoingCountEl = document.getElementById('globalBoingCount')!
const mobileOverlay = document.getElementById('mobileOverlay')
const mobileStartBtn = document.getElementById('mobileStartBtn')
const heatmapToggle = document.getElementById('heatmapToggle') as HTMLInputElement

// --- Physics Configuration ---
const basePos = { x: 17, y: 200 }
let restLength = 250

// Canvas sizing - fit to window on mobile, max 600 on desktop
const CANVAS_HEIGHT = 400
const MAX_CANVAS_WIDTH = 600

function resizeCanvas() {
  const maxWidth = Math.min(window.innerWidth * 0.9 - 24, MAX_CANVAS_WIDTH) // 24 for border + shadow
  canvas.width = maxWidth
  canvas.height = CANVAS_HEIGHT
  // Spring rest length - ~50% of available canvas width, max 250 on desktop
  restLength = Math.min((canvas.width - basePos.x) * 0.5, 250)
}

resizeCanvas()
window.addEventListener('resize', () => {
  resizeCanvas()
  // Reset spring to rest position on resize (no weird animation)
  knobPos.x = basePos.x + restLength
  knobPos.y = basePos.y
  currentLength = restLength
  currentAngle = 0
  lengthVelocity = 0
  angularVelocity = 0
})

// Load boing count from localStorage
let boingCount = parseInt(localStorage.getItem('boingCount') || '0', 10)
updateBoingCountDisplay()

// Mobile audio unlock
if (mobileStartBtn && mobileOverlay) {
  mobileStartBtn.addEventListener('touchend', (e) => {
    e.preventDefault()
    audioEnabled = true
    mobileOverlay.style.display = 'none'
  })
  mobileStartBtn.addEventListener('click', () => {
    audioEnabled = true
    mobileOverlay.style.display = 'none'
  })
}

// Spring physics
const springStiffness = 0.95
const friction = 0.88

// Visual "Bendiness" - how far out the spring stays straight before curving
const bendStiffness = 150

// Resistance Configuration
const pullLimit = 300
const pushLimit = 400

// State
let knobPos = { x: basePos.x + restLength, y: basePos.y }
let isDragging = false
let mousePos = { x: 0, y: 0 }
let audioEnabled = false
let lastTime = 0
const targetFrameTime = 1000 / 60 // Target 60fps

// Polar physics state
let currentLength = restLength
let currentAngle = 0
let lengthVelocity = 0
let angularVelocity = 0
const angularFriction = 0.9


// Initialize knob position after restLength is calculated
knobPos.x = basePos.x + restLength

// Audio - Howler setup for layered sounds
const boingSound = new Howl({
  src: ['/boing2.wav'],
  preload: true,
  volume: 0.7,
  html5: false, // Use Web Audio API for layering support
  onloaderror: (_id, err) => console.error('Failed to load boing sound:', err),
  onplayerror: (_id, err) => {
    console.error('Failed to play boing sound:', err)
  },
})

// Track active sound IDs for fading when caught
let activeSoundIds: number[] = []

function fadeOutActiveSounds() {
  activeSoundIds.forEach(id => {
    const currentVol = boingSound.volume(id) as number
    boingSound.fade(currentVol, 0, 100, id)
  })
  activeSoundIds = []
}

function updateBoingCountDisplay() {
  boingCountEl.innerText = `you've boinged ${boingCount.toLocaleString()} time${boingCount === 1 ? '' : 's'}`
  globalBoingCountEl.innerText = `the world has boinged ${globalBoingCount === null ? '?' : globalBoingCount.toLocaleString()} time${globalBoingCount === 1 ? '' : 's'}`
}

async function reportBoingToServer(angle: number, distRatio: number) {
  if (!API_URL) return
  try {
    const res = await fetch(`${API_URL}/boing`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ angle, dist_ratio: distRatio })
    })
    if (res.ok) {
      const data = await res.json()
      globalBoingCount = data.count
      updateBoingCountDisplay()
    }
  } catch (e) {
    // Silently fail - don't break the game
  }
}

async function fetchGlobalCount() {
  if (!API_URL) return
  try {
    const res = await fetch(`${API_URL}/count`)
    if (res.ok) {
      const data = await res.json()
      globalBoingCount = data.count
      updateBoingCountDisplay()
    }
  } catch (e) {
    // Silently fail
  }
}

// Fetch initial count
fetchGlobalCount()

// Heatmap state
let heatmapVisible = false
let heatmapImage: HTMLImageElement | null = null
let heatmapInterval: number | null = null

async function fetchHeatmapImage() {
  if (!API_URL) return
  try {
    const url = `${API_URL}/heatmap?w=${canvas.width}&h=${canvas.height}&r=${Math.round(restLength)}&t=${Date.now()}`
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })
    heatmapImage = img
  } catch (e) {
    // Silently fail
  }
}

heatmapToggle.addEventListener('change', async () => {
  heatmapVisible = heatmapToggle.checked
  if (heatmapVisible) {
    await fetchHeatmapImage()
    // Refresh every 5 seconds while visible
    heatmapInterval = window.setInterval(fetchHeatmapImage, 5000)
  } else {
    // Stop refreshing when hidden
    if (heatmapInterval) {
      clearInterval(heatmapInterval)
      heatmapInterval = null
    }
  }
})

function triggerBoing(forceMagnitude: number) {
  if (!audioEnabled) return

  // Calculate playback rate based on force - more force = higher pitch
  // Pitched up 10% overall (multiply by 1.1)
  const minRate = 0.9 * 1.1
  const maxRate = 1.5 * 1.1
  const normalizedForce = Math.min(forceMagnitude / 200, 1)
  const rate = minRate + normalizedForce * (maxRate - minRate)

  // Calculate initial volume based on force
  const minVolume = 0.3
  const maxVolume = 1.0
  const volume = minVolume + normalizedForce * (maxVolume - minVolume)

  // Play a new instance - Howler automatically layers sounds
  const id = boingSound.play()
  boingSound.rate(rate, id)
  boingSound.volume(volume, id)
  activeSoundIds.push(id)

  // Simple fade out over 1.9 seconds
  boingSound.fade(volume, 0.1, 1900, id)

  // Remove from active list when done
  boingSound.once('end', () => {
    activeSoundIds = activeSoundIds.filter(sid => sid !== id)
  }, id)

  // Increment and save boing count
  boingCount++
  localStorage.setItem('boingCount', boingCount.toString())
  updateBoingCountDisplay()

  // Report to server with polar coordinates
  // angle is in radians, distRatio is length/restLength
  reportBoingToServer(currentAngle, currentLength / restLength)
}


// --- Interaction ---
function getMousePos(evt: MouseEvent | Touch): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  return {
    x: evt.clientX - rect.left,
    y: evt.clientY - rect.top,
  }
}

function handleStart(pos: { x: number; y: number }) {
  // Unlock audio on first interaction (required for iOS)
  if (!audioEnabled) {
    const id = boingSound.play()
    boingSound.volume(0, id)
    boingSound.stop(id)
    audioEnabled = true
  }

  const dist = Math.hypot(pos.x - knobPos.x, pos.y - knobPos.y)
  if (dist < 50) {
    // If catching the ball mid-air, fade out any playing sounds
    const speed = Math.abs(lengthVelocity) + Math.abs(angularVelocity) * currentLength
    if (speed > 1) {
      fadeOutActiveSounds()
    }
    isDragging = true
    mousePos = pos
  }
}

function handleMove(pos: { x: number; y: number }) {
  if (isDragging) {
    mousePos = pos
  }
}

function handleEnd() {
  if (isDragging) {
    isDragging = false
    const dx = knobPos.x - (basePos.x + restLength)
    const dy = knobPos.y - basePos.y
    const displacement = Math.hypot(dx, dy)

    if (displacement > 10) {
      triggerBoing(displacement)
    }
  }
}

// Mouse events
canvas.addEventListener('mousedown', (e) => {
  e.preventDefault()
  handleStart(getMousePos(e))
})

window.addEventListener('mousemove', (e) => {
  if (isDragging) {
    e.preventDefault()
    handleMove(getMousePos(e))
  }
})

window.addEventListener('mouseup', () => {
  handleEnd()
})

// Touch events - with preventDefault to stop page scrolling
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault()
  if (e.touches.length > 0) {
    handleStart(getMousePos(e.touches[0]))
  }
}, { passive: false })

window.addEventListener('touchmove', (e) => {
  if (isDragging) {
    e.preventDefault()
    if (e.touches.length > 0) {
      handleMove(getMousePos(e.touches[0]))
    }
  }
}, { passive: false })

window.addEventListener('touchend', (e) => {
  if (isDragging) {
    e.preventDefault()
  }
  handleEnd()
}, { passive: false })


window.addEventListener('touchcancel', () => {
  handleEnd()
})

// Neutralize spring when tab loses focus (but let sounds finish playing)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Reset spring to rest position and zero velocity
    knobPos.x = basePos.x + restLength
    knobPos.y = basePos.y
    currentLength = restLength
    currentAngle = 0
    lengthVelocity = 0
    angularVelocity = 0
    isDragging = false
  }
})

// --- Physics Engine ---
function updatePhysics(deltaTime: number) {
  const timeScale = deltaTime / targetFrameTime

  if (isDragging) {
    let dx = mousePos.x - basePos.x
    let dy = mousePos.y - basePos.y

    // Wall constraint: cannot go behind wall
    if (dx < 0) dx = 0

    const mouseDist = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    // Resistance curve (asymptotic limit)
    const offset = mouseDist - restLength
    let newDist = restLength

    if (offset > 0) {
      // Pulling away
      newDist = restLength + (offset / (1 + offset / pullLimit))
    } else {
      // Pushing in (harder)
      const absOffset = Math.abs(offset)
      newDist = restLength - (absOffset / (1 + absOffset / pushLimit))
      if (newDist < 20) newDist = 20
    }

    knobPos.x = basePos.x + Math.cos(angle) * newDist
    knobPos.y = basePos.y + Math.sin(angle) * newDist

    // Clamp ball so it doesn't overlap the wall (ball radius is 16)
    const minX = basePos.x + 16
    if (knobPos.x < minX) {
      knobPos.x = minX
    }

    // Update polar state to match current position
    currentLength = Math.hypot(knobPos.x - basePos.x, knobPos.y - basePos.y)
    currentAngle = Math.atan2(knobPos.y - basePos.y, knobPos.x - basePos.x)
    lengthVelocity = 0
    angularVelocity = 0
  } else {
    // Polar spring physics - length springs back, angle decays separately

    // Spring force on length (Hooke's law)
    const lengthAccel = (restLength - currentLength) * springStiffness * timeScale
    lengthVelocity += lengthAccel
    lengthVelocity *= Math.pow(friction, timeScale)
    currentLength += lengthVelocity * timeScale

    // Dampen angle toward 0
    const angleAccel = -currentAngle * 0.9 * timeScale
    angularVelocity += angleAccel
    angularVelocity *= Math.pow(angularFriction, timeScale)
    currentAngle += angularVelocity * timeScale

    // Clamp length (minimum is ball radius)
    if (currentLength < 16) {
      currentLength = 16
      lengthVelocity *= -0.5
    }

    // Convert polar back to cartesian
    knobPos.x = basePos.x + Math.cos(currentAngle) * currentLength
    knobPos.y = basePos.y + Math.sin(currentAngle) * currentLength

    // Wall bounce (ball radius is 16)
    const minX = basePos.x + 16
    if (knobPos.x < minX) {
      knobPos.x = minX
      // Reflect angle off wall
      if (Math.abs(currentAngle) > Math.PI / 2) {
        currentAngle = Math.sign(currentAngle) * Math.PI - currentAngle
        angularVelocity *= -0.5
      }
      currentLength = Math.hypot(knobPos.x - basePos.x, knobPos.y - basePos.y)
      lengthVelocity *= -0.5
    }
  }
}

// --- Drawing ---
function drawSpring() {
  // Define the curve control points for bending
  const p0 = basePos // Start (wall)
  const p2 = knobPos // End (knob)

  // Control point forces the line to leave the wall horizontally
  // Adjust based on compression to prevent loops
  const currentLen = Math.hypot(p2.x - p0.x, p2.y - p0.y)
  const dynamicStiffness = Math.min(bendStiffness, currentLen * 0.5)
  const p1 = { x: basePos.x + dynamicStiffness, y: basePos.y }

  // Draw coils along the Bézier curve
  ctx.beginPath()
  ctx.moveTo(basePos.x, basePos.y)

  const coils = 25
  const steps = 100

  for (let i = 0; i <= steps; i++) {
    const t = i / steps

    // Get point on curve (Quadratic Bézier formula)
    const oneMinusT = 1 - t
    const bx = oneMinusT * oneMinusT * p0.x + 2 * oneMinusT * t * p1.x + t * t * p2.x
    const by = oneMinusT * oneMinusT * p0.y + 2 * oneMinusT * t * p1.y + t * t * p2.y

    // Calculate tangent (direction of curve at this point)
    const tx = 2 * oneMinusT * (p1.x - p0.x) + 2 * t * (p2.x - p1.x)
    const ty = 2 * oneMinusT * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)

    // Calculate normal (perpendicular to tangent)
    const len = Math.hypot(tx, ty)
    const nx = -ty / len
    const ny = tx / len

    // Visual tapering - wide at base, narrow at tip
    let width = 25 * (1.2 - t)
    if (currentLen < restLength) {
      const bulge = 1 + ((restLength - currentLen) / restLength)
      width *= bulge
    }

    // Coil sine wave along the normal vector
    const sine = Math.sin(t * coils * Math.PI * 2)
    const finalX = bx + nx * sine * width
    const finalY = by + ny * sine * width

    ctx.lineTo(finalX, finalY)
  }

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 3
  ctx.strokeStyle = '#444'

  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 4

  ctx.stroke()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
}

function drawKnob() {
  ctx.beginPath()
  ctx.arc(knobPos.x, knobPos.y, 16, 0, Math.PI * 2)

  const grad = ctx.createRadialGradient(
    knobPos.x - 4, knobPos.y - 4, 2,
    knobPos.x, knobPos.y, 16
  )
  grad.addColorStop(0, '#ff6b6b')
  grad.addColorStop(1, '#c23616')

  ctx.fillStyle = grad
  ctx.fill()
  ctx.strokeStyle = '#2d3436'
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.beginPath()
  ctx.ellipse(knobPos.x - 6, knobPos.y - 6, 4, 2, Math.PI / 4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fill()
}

function draw(currentTime: number) {
  // Delta time for frame-rate independent physics
  if (lastTime === 0) lastTime = currentTime
  const deltaTime = Math.min(currentTime - lastTime, 50)
  lastTime = currentTime

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Draw heatmap if visible
  if (heatmapVisible && heatmapImage) {
    ctx.drawImage(heatmapImage, 0, 0)
  }

  // Wall
  ctx.fillStyle = '#ccc'
  ctx.fillRect(0, 0, basePos.x, canvas.height)
  ctx.strokeStyle = '#aaa'
  ctx.beginPath()
  ctx.moveTo(basePos.x, 0)
  ctx.lineTo(basePos.x, canvas.height)
  ctx.stroke()

  // Tension line while dragging
  if (isDragging) {
    ctx.beginPath()
    ctx.moveTo(knobPos.x, knobPos.y)
    ctx.lineTo(mousePos.x, mousePos.y)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(mousePos.x, mousePos.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.fill()
  }

  drawSpring()
  drawKnob()

  updatePhysics(deltaTime)
  requestAnimationFrame(draw)
}

requestAnimationFrame(draw)
