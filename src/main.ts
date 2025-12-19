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
    <canvas id="canvas" tabindex="0"></canvas>
    <div class="canvas-ui">
      <div id="boingCount">you've boinged 0 times</div>
      <div id="globalBoingCount">the world has boinged ? times</div>
      <div id="footerLinks"><label><input type="checkbox" id="heatmapToggle"> boing heatmap</label> <label><input type="checkbox" id="slomoToggle"> slomo</label></div>
    </div>
    <div id="keyboardInstructions">keyboard: hold Space + Arrow keys, release Space to boing!</div>
  </div>
  <div id="bottomLinks">
    <div id="newsletterLink"><a href="#" id="openNewsletter">subscribe to my newsletter</a></div>
    <div id="creditLinks"><a href="mailto:hi@greg.technology">e-mail</a> • <a href="https://github.com/gregsadetsky/boing" target="_blank">github</a> • <a href="https://disco.cloud/" target="_blank">hosted with Disco</a></div>
  </div>
  <div id="newsletterModal">
    <div id="newsletterModalContent">
      <button id="closeNewsletter">&times;</button>
      <form id="newsletterForm" class="embeddable-buttondown-form" action="https://buttondown.com/api/emails/embed-subscribe/gregtechnology" method="post" target="newsletterIframe">
        <label for="bd-email">I'll send you fun things on an irregular schedule. thank you.</label>
        <input type="email" name="email" id="bd-email" placeholder="your@email.com" required />
        <input type="submit" value="Subscribe" />
      </form>
      <div id="newsletterMessage"></div>
      <iframe name="newsletterIframe" style="display:none;"></iframe>
    </div>
  </div>
`

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!
const boingCountEl = document.getElementById('boingCount')!
const globalBoingCountEl = document.getElementById('globalBoingCount')!
const mobileOverlay = document.getElementById('mobileOverlay')
const mobileStartBtn = document.getElementById('mobileStartBtn')
const heatmapToggle = document.getElementById('heatmapToggle') as HTMLInputElement
const slomoToggle = document.getElementById('slomoToggle') as HTMLInputElement
const openNewsletterBtn = document.getElementById('openNewsletter')!
const newsletterModal = document.getElementById('newsletterModal')!
const closeNewsletterBtn = document.getElementById('closeNewsletter')!

// Newsletter modal handlers
const emailInput = document.getElementById('bd-email') as HTMLInputElement
const newsletterForm = document.getElementById('newsletterForm') as HTMLFormElement
const newsletterMessage = document.getElementById('newsletterMessage')!

openNewsletterBtn.addEventListener('click', (e) => {
  e.preventDefault()
  // Reset form state
  newsletterForm.style.display = ''
  newsletterForm.reset()
  const submitBtn = newsletterForm.querySelector('input[type="submit"]') as HTMLInputElement
  submitBtn.value = 'Subscribe'
  submitBtn.disabled = false
  newsletterMessage.textContent = ''
  newsletterMessage.className = ''

  newsletterModal.classList.add('visible')
  newsletterModal.addEventListener('transitionend', () => emailInput.focus(), { once: true })
})

closeNewsletterBtn.addEventListener('click', () => {
  newsletterModal.classList.remove('visible')
})

newsletterModal.addEventListener('click', (e) => {
  if (e.target === newsletterModal) {
    newsletterModal.classList.remove('visible')
  }
})

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && newsletterModal.classList.contains('visible')) {
    newsletterModal.classList.remove('visible')
  }
})

newsletterForm.addEventListener('submit', () => {
  const submitBtn = newsletterForm.querySelector('input[type="submit"]') as HTMLInputElement
  submitBtn.value = 'Subscribing...'
  submitBtn.disabled = true

  // Show success after a brief delay (form submits to hidden iframe)
  setTimeout(() => {
    newsletterForm.style.display = 'none'
    newsletterMessage.textContent = 'Thanks for subscribing!'
    newsletterMessage.className = 'success'
  }, 1000)
})

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

// Keyboard control state
let keyboardGrabbing = false
let keyboardDirection = { x: 0, y: 0 } // -1 to 1 for each axis

// Polar physics state
let currentLength = restLength
let currentAngle = 0
let lengthVelocity = 0
let angularVelocity = 0
const angularFriction = 0.9

// Slomo state
let slomoEnabled = false
const slomoFactor = 20

// Dark mode state - follows browser setting
const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)')
let darkMode = darkModeQuery.matches
darkModeQuery.addEventListener('change', (e) => {
  darkMode = e.matches
})

// Debug mode - enable with enableDebug() in console
let debugMode = false
  ; (window as any).enableDebug = () => {
    debugMode = true
    console.log('Debug mode enabled - will log physics state on each boing')
  }
  ; (window as any).disableDebug = () => {
    debugMode = false
    console.log('Debug mode disabled')
  }

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
  globalBoingCountEl.innerText = `the world has boinged ${globalBoingCount === null ? '?' : globalBoingCount.toLocaleString()} time${globalBoingCount === 1 ? '' : 's'} ❤️`
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

// Fetch initial count and refresh every 30s
fetchGlobalCount()
setInterval(fetchGlobalCount, 30000)

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
    // Only blink on first load (no cached image yet)
    const needsLoading = !heatmapImage
    let blinkInterval: number | null = null

    if (needsLoading) {
      const label = heatmapToggle.parentElement!
      let isGrey = false
      blinkInterval = setInterval(() => {
        isGrey = !isGrey
        label.style.color = isGrey ? '#ccc' : ''
      }, 600)
    }

    await fetchHeatmapImage()

    // Stop blinking
    if (blinkInterval) {
      clearInterval(blinkInterval)
      heatmapToggle.parentElement!.style.color = ''
    }

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

slomoToggle.addEventListener('change', () => {
  slomoEnabled = slomoToggle.checked

  // Update playback rate of all currently playing sounds
  activeSoundIds.forEach((id) => {
    const currentRate = boingSound.rate(id) as number
    let newRate: number

    if (slomoEnabled) {
      // Entering slomo - slow down the sound
      newRate = currentRate / 30
    } else {
      // Exiting slomo - speed up the sound
      newRate = currentRate * 30
    }

    boingSound.rate(newRate, id)
  })
})


function triggerBoing(forceMagnitude: number) {
  if (!audioEnabled) return

  if (debugMode) {
    console.log('BOING ' + JSON.stringify({
      knobPos,
      currentLength,
      currentAngle,
      lengthVelocity,
      angularVelocity,
      forceMagnitude,
      restLength,
      slomoEnabled
    }))
  }

  // Calculate playback rate based on force - more force = higher pitch
  // Pitched up 10% overall (multiply by 1.1)
  const minRate = 0.9 * 1.1
  const maxRate = 1.5 * 1.1
  const normalizedForce = Math.min(forceMagnitude / 200, 1)
  let rate = minRate + normalizedForce * (maxRate - minRate)

  // Pitch down in slomo mode
  if (slomoEnabled) {
    rate = rate / 30
  }

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
    canvas.style.cursor = 'grabbing'
  }
}

function handleMove(pos: { x: number; y: number }) {
  if (isDragging) {
    mousePos = pos
    canvas.style.cursor = 'grabbing'
  } else {
    // Update cursor based on proximity to ball
    const dist = Math.hypot(pos.x - knobPos.x, pos.y - knobPos.y)
    canvas.style.cursor = dist < 50 ? 'grab' : 'default'
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

canvas.addEventListener('mousemove', (e) => {
  handleMove(getMousePos(e))
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

// --- Keyboard Controls (for accessibility) ---
const activeKeys = new Set<string>()

// Detect keyboard navigation (Tab key) to show instructions
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    document.body.classList.add('keyboard-nav')
  }
})

// Hide keyboard nav hints when mouse is used
window.addEventListener('mousedown', () => {
  document.body.classList.remove('keyboard-nav')
})

// Show instructions when canvas receives focus
canvas.addEventListener('focus', () => {
  document.body.classList.add('keyboard-nav')
})

canvas.addEventListener('keydown', (e) => {
  const key = e.key

  // Space or Enter to grab
  if ((key === ' ' || key === 'Enter') && !keyboardGrabbing) {
    e.preventDefault()

    // Unlock audio on first interaction
    if (!audioEnabled) {
      const id = boingSound.play()
      boingSound.volume(0, id)
      boingSound.stop(id)
      audioEnabled = true
    }

    // If catching mid-air, fade out sounds
    const speed = Math.abs(lengthVelocity) + Math.abs(angularVelocity) * currentLength
    if (speed > 1) {
      fadeOutActiveSounds()
    }

    keyboardGrabbing = true
    isDragging = true
    keyboardDirection = { x: 0, y: 0 }

    // Mark instructions as used (fades them)
    const instructionsEl = document.getElementById('keyboardInstructions')
    if (instructionsEl) {
      instructionsEl.classList.add('used')
    }
  }

  // Arrow keys to stretch (only while grabbing)
  if (keyboardGrabbing && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    e.preventDefault()
    activeKeys.add(key)
    updateKeyboardDirection()
  }
})

canvas.addEventListener('keyup', (e) => {
  const key = e.key

  // Release space/enter to boing
  if ((key === ' ' || key === 'Enter') && keyboardGrabbing) {
    e.preventDefault()
    keyboardGrabbing = false
    isDragging = false
    activeKeys.clear()
    keyboardDirection = { x: 0, y: 0 }

    const dx = knobPos.x - (basePos.x + restLength)
    const dy = knobPos.y - basePos.y
    const displacement = Math.hypot(dx, dy)

    if (displacement > 10) {
      triggerBoing(displacement)
    }
  }

  // Release arrow keys
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) {
    activeKeys.delete(key)
    updateKeyboardDirection()
  }
})

// Reset keyboard state if canvas loses focus while grabbing
canvas.addEventListener('blur', () => {
  if (keyboardGrabbing) {
    keyboardGrabbing = false
    isDragging = false
    activeKeys.clear()
    keyboardDirection = { x: 0, y: 0 }
  }
})

function updateKeyboardDirection() {
  keyboardDirection.x = 0
  keyboardDirection.y = 0

  if (activeKeys.has('ArrowLeft')) keyboardDirection.x -= 1
  if (activeKeys.has('ArrowRight')) keyboardDirection.x += 1
  if (activeKeys.has('ArrowUp')) keyboardDirection.y -= 1
  if (activeKeys.has('ArrowDown')) keyboardDirection.y += 1
}

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
    // Reset keyboard state
    keyboardGrabbing = false
    keyboardDirection = { x: 0, y: 0 }
    activeKeys.clear()
  }
})

// --- Physics Engine ---
function updatePhysics(deltaTime: number) {
  // Subdivide large timesteps to prevent instability
  const maxStep = 16 // Max 16ms per physics step
  const steps = Math.ceil(deltaTime / maxStep)
  const stepTime = deltaTime / steps

  for (let i = 0; i < steps; i++) {
    updatePhysicsStep(stepTime)
  }
}

function updatePhysicsStep(deltaTime: number) {
  let timeScale = deltaTime / targetFrameTime
  if (slomoEnabled) {
    timeScale = timeScale / slomoFactor
  }

  if (isDragging) {
    let dx: number
    let dy: number

    if (keyboardGrabbing) {
      // Keyboard control: lerp toward target position based on arrow keys
      // Horizontal needs larger value because resistance curve limits stretch more than angle
      const targetX = basePos.x + restLength + keyboardDirection.x * 3500
      const targetY = basePos.y + keyboardDirection.y * 500

      const lerpSpeed = 0.15 * timeScale
      const goalX = knobPos.x + (targetX - knobPos.x) * lerpSpeed
      const goalY = knobPos.y + (targetY - knobPos.y) * lerpSpeed

      dx = goalX - basePos.x
      dy = goalY - basePos.y
    } else {
      // Mouse/touch control
      dx = mousePos.x - basePos.x
      dy = mousePos.y - basePos.y
    }

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

  // Sanity check: reset if physics go haywire
  const isInvalid = !Number.isFinite(currentLength) ||
    !Number.isFinite(currentAngle) ||
    !Number.isFinite(lengthVelocity) ||
    !Number.isFinite(angularVelocity) ||
    Math.abs(lengthVelocity) > 10000 ||
    Math.abs(angularVelocity) > 1000

  if (isInvalid) {
    const reason = !Number.isFinite(currentLength) ? 'currentLength not finite' :
      !Number.isFinite(currentAngle) ? 'currentAngle not finite' :
        !Number.isFinite(lengthVelocity) ? 'lengthVelocity not finite' :
          !Number.isFinite(angularVelocity) ? 'angularVelocity not finite' :
            Math.abs(lengthVelocity) > 10000 ? 'lengthVelocity too high' :
              'angularVelocity too high'
    console.warn('Physics reset: ' + reason + ' ' + JSON.stringify({
      currentLength,
      currentAngle,
      lengthVelocity,
      angularVelocity,
      knobPos,
      deltaTime,
      timeScale
    }))
    knobPos.x = basePos.x + restLength
    knobPos.y = basePos.y
    currentLength = restLength
    currentAngle = 0
    lengthVelocity = 0
    angularVelocity = 0
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
  ctx.strokeStyle = darkMode ? '#aaa' : '#444'

  ctx.shadowColor = darkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)'
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

  // Canvas background for dark mode
  if (darkMode) {
    ctx.fillStyle = '#1a1a1a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Draw heatmap if visible
  if (heatmapVisible && heatmapImage) {
    ctx.drawImage(heatmapImage, 0, 0)
  }

  // Wall
  ctx.fillStyle = darkMode ? '#333' : '#ccc'
  ctx.fillRect(0, 0, basePos.x, canvas.height)
  ctx.strokeStyle = darkMode ? '#555' : '#aaa'
  ctx.beginPath()
  ctx.moveTo(basePos.x, 0)
  ctx.lineTo(basePos.x, canvas.height)
  ctx.stroke()

  // Tension line while dragging (mouse/touch only, not keyboard)
  if (isDragging && !keyboardGrabbing) {
    ctx.beginPath()
    ctx.moveTo(knobPos.x, knobPos.y)
    ctx.lineTo(mousePos.x, mousePos.y)
    ctx.setLineDash([4, 4])
    ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])

    ctx.beginPath()
    ctx.arc(mousePos.x, mousePos.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)'
    ctx.fill()
  }

  drawSpring()
  drawKnob()

  updatePhysics(deltaTime)
  requestAnimationFrame(draw)
}

requestAnimationFrame(draw)
