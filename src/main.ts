import { Howl } from 'howler'
import isMobile from 'is-mobile'
import './style.css'

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
  <canvas id="canvas"></canvas>
  <div class="ui-layer">
    <div id="boingCount">you've boinged 0 times</div>
  </div>
`

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const boingCountEl = document.getElementById('boingCount')!
const mobileOverlay = document.getElementById('mobileOverlay')
const mobileStartBtn = document.getElementById('mobileStartBtn')

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
  velocity = { x: 0, y: 0 }
})

// Load boing count from localStorage
let boingCount = parseInt(localStorage.getItem('boingCount') || '0', 10)
updateBoingCountDisplay()

// Mobile audio unlock
if (mobileStartBtn && mobileOverlay) {
  mobileStartBtn.addEventListener('touchend', (e) => {
    e.preventDefault()
    initAudio()
    mobileOverlay.style.display = 'none'
  })
  mobileStartBtn.addEventListener('click', () => {
    initAudio()
    mobileOverlay.style.display = 'none'
  })
}

// Spring physics
const springStiffness = 0.85
const friction = 0.88

// Visual "Bendiness" - how far out the spring stays straight before curving
const bendStiffness = 150

// Resistance Configuration
const pullLimit = 300
const pushLimit = 400

// State
let knobPos = { x: basePos.x + restLength, y: basePos.y }
let velocity = { x: 0, y: 0 }
let isDragging = false
let mousePos = { x: 0, y: 0 }
let audioEnabled = false
let lastTime = 0
const targetFrameTime = 1000 / 60 // Target 60fps

// Initialize knob position after restLength is calculated
knobPos.x = basePos.x + restLength

// Audio - Howler setup for layered sounds
let boingSound: Howl | null = null

function updateBoingCountDisplay() {
  boingCountEl.innerText = `you've boinged ${boingCount} time${boingCount === 1 ? '' : 's'}`
}

function initAudio() {
  if (boingSound) return

  boingSound = new Howl({
    src: ['/boing2.wav'],
    preload: true,
    volume: 0.7,
    html5: false, // Use Web Audio API for layering support
    onloaderror: (_id, err) => console.error('Failed to load boing sound:', err),
    onplayerror: (_id, err) => {
      console.error('Failed to play boing sound:', err)
    },
  })

  audioEnabled = true
}

function triggerBoing(forceMagnitude: number) {
  if (!audioEnabled || !boingSound) return

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

  // Simple fade out over 2 seconds
  boingSound.fade(volume, 0.1, 1200, id)

  // Increment and save boing count
  boingCount++
  localStorage.setItem('boingCount', boingCount.toString())
  updateBoingCountDisplay()
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
  // Always init audio on first interaction (required for iOS)
  if (!audioEnabled) {
    initAudio()
    // Play a silent/tiny sound to unlock audio context on iOS
    if (boingSound) {
      const id = boingSound.play()
      boingSound.volume(0, id)
      boingSound.stop(id)
    }
  }

  const dist = Math.hypot(pos.x - knobPos.x, pos.y - knobPos.y)
  if (dist < 50) {
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

    velocity = { x: 0, y: 0 }
  } else {
    // Spring back with Hooke's Law (scaled by time)
    const targetX = basePos.x + restLength
    const targetY = basePos.y

    const ax = (targetX - knobPos.x) * springStiffness * timeScale
    const ay = (targetY - knobPos.y) * springStiffness * timeScale

    velocity.x += ax
    velocity.y += ay

    // Add tiny randomness for organic feel
    velocity.x += (Math.random() - 0.5) * 0.1
    velocity.y += (Math.random() - 0.5) * 0.1

    // Friction (adjusted for time scale)
    const frictionPerFrame = Math.pow(friction, timeScale)
    velocity.x *= frictionPerFrame
    velocity.y *= frictionPerFrame

    knobPos.x += velocity.x * timeScale
    knobPos.y += velocity.y * timeScale

    // Wall bounce
    if (knobPos.x < basePos.x + 20) {
      knobPos.x = basePos.x + 20
      velocity.x *= -0.5
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
