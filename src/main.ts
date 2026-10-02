import { createGame, type HudState } from './game'
import { ITEMS, type ItemId } from './items'
import { formatTime, ordinal } from './math'
import { RACERS } from './racers'

const view = document.querySelector<HTMLElement>('#view')
const minimap = document.querySelector<HTMLCanvasElement>('#minimap')
if (!view || !minimap) throw new Error('Missing game mount')

const game = createGame(view, minimap)
const controls = game.controls

const menu = must('#menu')
const hud = must('#hud')
const podium = must('#podium')
const controlBar = must('#controls')
const banner = must('#banner')
const toast = must('#toast')
const cards = must('#cards')
const raceBtn = must<HTMLButtonElement>('#race')
const againBtn = must<HTMLButtonElement>('#again')
const changeBtn = must<HTMLButtonElement>('#change')
const pauseBtn = must<HTMLButtonElement>('#pause')
const resumeBtn = must<HTMLButtonElement>('#resume')
const pauseCard = must('#pause-card')
const muteBtn = must<HTMLButtonElement>('#mute')

const key = { left: false, right: false, brake: false, drift: false }
const touch = { left: false, right: false, brake: false, drift: false }

RACERS.forEach((racer, index) => {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'card'
  button.dataset.index = String(index)
  button.setAttribute('role', 'option')
  const stats: Array<[string, number]> = [
    ['Accel', racer.accel / 1.35],
    ['Speed', racer.speed / 1.35],
    ['Grip', racer.grip / 1.35],
    ['Boost', racer.boost / 1.35]
  ]
  button.innerHTML = `
    <span class="swatch" style="background:${racer.body}"></span>
    <b>${racer.name}</b>
    <small>${racer.title}</small>
    <span class="bars">${stats
      .map(([, value]) => `<i><span style="width:${Math.round(value * 100)}%"></span></i>`)
      .join('')}</span>
  `
  button.addEventListener('click', () => {
    game.select(index)
    audioKick()
  })
  cards.appendChild(button)
})

raceBtn.addEventListener('click', () => {
  audioKick()
  game.start()
})
againBtn.addEventListener('click', () => {
  audioKick()
  game.again()
})
changeBtn.addEventListener('click', () => game.menu())
pauseBtn.addEventListener('click', () => game.togglePause())
resumeBtn.addEventListener('click', () => game.togglePause())
muteBtn.addEventListener('click', () => {
  const muted = game.toggleMute()
  muteBtn.textContent = muted ? 'Sound off' : 'Sound on'
})

hold(must('#btn-left'), (down) => {
  touch.left = down
  publishTouch()
  if (down) controls.tap = true
})
hold(must('#btn-right'), (down) => {
  touch.right = down
  publishTouch()
  if (down) controls.tap = true
})
hold(must('#btn-brake'), (down) => {
  touch.brake = down
  publishTouch()
  if (down) controls.tap = true
})
hold(must('#btn-drift'), (down) => {
  touch.drift = down
  publishTouch()
  if (down) controls.tap = true
})
must('#btn-item').addEventListener('pointerdown', (event) => {
  event.preventDefault()
  controls.useItem = true
  controls.tap = true
  audioKick()
})

window.addEventListener('keydown', (event) => {
  const k = event.key.toLowerCase()
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) event.preventDefault()
  if (event.repeat) return
  if (k === 'arrowleft' || k === 'a') key.left = true
  if (k === 'arrowright' || k === 'd') key.right = true
  if (k === 'arrowdown' || k === 's') key.brake = true
  if (k === 'arrowup' || k === 'w' || k === 'shift') key.drift = true
  publishTouch()
  const phase = game.hud().phase
  if (k === 'enter' && (phase === 'menu' || phase === 'podium')) {
    audioKick()
    if (phase === 'menu') game.start()
    else game.again()
    return
  }
  if ((k === 'arrowleft' || k === 'a') && phase === 'menu') game.cycle(-1)
  if ((k === 'arrowright' || k === 'd') && phase === 'menu') game.cycle(1)
  if (k === 'escape') game.togglePause()
  if (k === 'm') muteBtn.click()
  if (phase === 'countdown') controls.tap = true
  if (k === ' ' || k === 'e' || k === 'f') controls.useItem = true
})

window.addEventListener('keyup', (event) => {
  const k = event.key.toLowerCase()
  if (k === 'arrowleft' || k === 'a') key.left = false
  if (k === 'arrowright' || k === 'd') key.right = false
  if (k === 'arrowdown' || k === 's') key.brake = false
  if (k === 'arrowup' || k === 'w' || k === 'shift') key.drift = false
  publishTouch()
})

let lastBanner = ''
let lastItem: ItemId | null | undefined
let lastPhase: HudState['phase'] | null = null
let lastBoard = ''

function tick() {
  const state = game.hud()
  menu.hidden = state.phase !== 'menu'
  const racing = state.phase === 'countdown' || state.phase === 'race' || state.phase === 'celebrate'
  hud.hidden = !racing
  controlBar.hidden = !racing
  podium.hidden = state.phase !== 'podium'
  pauseCard.hidden = !state.paused
  pauseBtn.hidden = state.phase !== 'race' && state.phase !== 'countdown'

  if (state.banner !== lastBanner) {
    banner.textContent = state.banner
    banner.classList.remove('pop')
    if (state.banner) {
      void banner.offsetWidth
      banner.classList.add('pop')
    }
    lastBanner = state.banner
  }
  toast.textContent = state.toast

  paintMenu(state)
  if (racing) paintHud(state)
  if (state.phase === 'podium' && lastPhase !== 'podium') paintPodium(state)
  lastPhase = state.phase
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

function paintMenu(state: HudState) {
  const racer = RACERS[state.selected]
  text('#racer-name', racer.name)
  text('#racer-title', racer.title)
  text('#racer-blurb', racer.blurb)
  text('#record', `Ridge record: ${state.bestText}`)
  cards.querySelectorAll<HTMLButtonElement>('.card').forEach((card, index) => {
    const on = index === state.selected
    card.classList.toggle('selected', on)
    card.setAttribute('aria-selected', on ? 'true' : 'false')
  })
}

function paintHud(state: HudState) {
  text('#place', ordinal(state.place))
  text('#lap', `Lap ${state.lapDisplay}/${state.laps}`)
  text('#speed', `${state.speed} km/h`)
  const drift = must('#drift')
  drift.hidden = state.drift < 0.05
  must<HTMLElement>('#drift-fill').style.width = `${Math.round(state.drift * 100)}%`
  const slot = must('#item')
  slot.classList.toggle('empty', !state.item)
  slot.classList.toggle('shield', state.shield)
  must('#btn-item').classList.toggle('ready', Boolean(state.item))
  if (state.item !== lastItem) {
    slot.classList.remove('pop')
    if (state.item) {
      void slot.offsetWidth
      slot.classList.add('pop')
    }
    lastItem = state.item
  }
  text('#item-name', state.item ? ITEMS[state.item].name : state.shield ? 'Bubble Wrap' : 'Empty')
  must('#item-icon').innerHTML = state.item ? icon(state.item) : state.shield ? icon('bubble') : ''
  const signature = state.rows.map((row) => `${row.place}:${row.name}:${row.isPlayer ? 1 : 0}`).join('|')
  if (signature !== lastBoard) {
    lastBoard = signature
    must('#board').innerHTML = state.rows
      .map(
        (row) => `<li class="${row.isPlayer ? 'me' : ''}">
          <span>${row.place}</span>
          <span><i class="dot" style="background:${row.color}"></i> ${escapeHtml(row.name)}</span>
        </li>`
      )
      .join('')
  }
}

function paintPodium(state: HudState) {
  const player = state.rows.find((row) => row.isPlayer)
  text('#podium-title', player ? `You finished ${ordinal(player.place)}` : 'Ribbon Cup')
  text('#podium-time', player?.finished ? formatTime(player.time) : '')
  text('#podium-record', state.record ? 'New ridge record!' : `Ridge record: ${state.bestText}`)
  must('#results').innerHTML = state.rows
    .map(
      (row) => `<li class="${row.isPlayer ? 'me' : ''}">
        <span>${row.place}</span>
        <span><i class="dot" style="background:${row.color}"></i> ${escapeHtml(row.name)}</span>
        <span class="time">${row.finished ? formatTime(row.time) : 'racing'}</span>
      </li>`
    )
    .join('')
}

function publishTouch() {
  controls.left = key.left || touch.left
  controls.right = key.right || touch.right
  controls.brake = key.brake || touch.brake
  controls.drift = key.drift || touch.drift
}

function hold(button: HTMLElement, on: (down: boolean) => void) {
  const down = (event: PointerEvent) => {
    event.preventDefault()
    button.setPointerCapture(event.pointerId)
    button.classList.add('held')
    on(true)
    audioKick()
  }
  const up = () => {
    button.classList.remove('held')
    on(false)
  }
  button.addEventListener('pointerdown', down)
  button.addEventListener('pointerup', up)
  button.addEventListener('pointercancel', up)
  button.addEventListener('lostpointercapture', up)
}

function icon(id: ItemId): string {
  const color = ITEMS[id].color
  if (id === 'spark' || id === 'bloom') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="${color}" stroke="#1b2437" stroke-width="1.5" d="M13 2 4 14h7l-1 8 10-14h-7z"/></svg>`
  }
  if (id === 'pebble') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="${color}" stroke="#1b2437" stroke-width="1.5"/></svg>`
  }
  if (id === 'gust') {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" d="M4 8h12M6 12h14M4 16h10"/></svg>`
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="${color}" fill-opacity="0.8" stroke="#1b2437" stroke-width="1.5"/></svg>`
}

function audioKick() {
  /* Playback starts on the same gesture inside the game. */
}

function text(selector: string, value: string) {
  const node = must(selector)
  if (node.textContent !== value) node.textContent = value
}

function must<T extends HTMLElement = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  if (!node) throw new Error(`Missing ${selector}`)
  return node
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
    return map[char] ?? char
  })
}
