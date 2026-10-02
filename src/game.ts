import * as THREE from 'three'
import { createAudio } from './audio'
import { createFx } from './effects'
import { ITEMS, rollItem, type ItemId } from './items'
import { alongDelta, clamp, formatTime, lerp, ordinal, wrapAngle } from './math'
import { RACERS, buildField, createRacerMesh, type RacerDef, type RacerMesh } from './racers'
import { ROAD_HALF, createLights, createTrack, tickClouds, tickWater, type Track } from './track'

const LAPS = 3
const RECORD_KEY = 'novadash.jellybean.best'

export type Phase = 'menu' | 'countdown' | 'race' | 'celebrate' | 'podium'

export type Controls = {
  left: boolean
  right: boolean
  brake: boolean
  drift: boolean
  useItem: boolean
  tap: boolean
}

export type BoardRow = {
  name: string
  place: number
  isPlayer: boolean
  finished: boolean
  time: number
  color: string
}

export type HudState = {
  phase: Phase
  selected: number
  place: number
  lapDisplay: number
  laps: number
  speed: number
  item: ItemId | null
  shield: boolean
  boosting: boolean
  drift: number
  banner: string
  toast: string
  rows: BoardRow[]
  record: boolean
  bestText: string
  paused: boolean
  playerName: string
  finishTime: number
}

type Racer = {
  def: RacerDef
  isPlayer: boolean
  view: RacerMesh
  speed: number
  heading: number
  pos: THREE.Vector3
  hint: number
  along: number
  lateral: number
  travel: number
  laps: number
  finished: boolean
  finishTime: number
  sinceLine: number
  item: ItemId | null
  shield: boolean
  boostTime: number
  boostPower: number
  superBoost: boolean
  invuln: number
  spin: number
  drift: number
  slide: number
  hop: number
  hopV: number
  padCd: number
  itemLock: number
  place: number
  aiSkill: number
  aiDrift: number
  steerVisual: number
  labelText: string
  walled: boolean
}

type Crate = { along: number; lateral: number; mesh: THREE.Group; active: boolean; wait: number }
type Pad = { along: number; mesh: THREE.Group }
type Hazard = { along: number; lateral: number; life: number; owner: number; mesh: THREE.Object3D; kind: 'rock' | 'gust' }

export type Game = {
  controls: Controls
  select: (index: number) => void
  cycle: (dir: number) => void
  start: () => void
  again: () => void
  menu: () => void
  togglePause: () => void
  toggleMute: () => boolean
  hud: () => HudState
  resize: () => void
}

export function createGame(view: HTMLElement, minimap: HTMLCanvasElement): Game {
  const audio = createAudio()
  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog('#c5e6ff', 110, 340)
  scene.background = new THREE.Color('#9fd4ff')
  const camera = new THREE.PerspectiveCamera(66, 1, 0.1, 900)
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  view.appendChild(renderer.domElement)

  const track: Track = createTrack()
  scene.add(track.group)
  const lights = createLights()
  scene.add(lights.hemi, lights.sun, lights.fill, lights.sun.target)
  const fx = createFx(scene)

  const controls: Controls = { left: false, right: false, brake: false, drift: false, useItem: false, tap: false }
  const hud: HudState = {
    phase: 'menu',
    selected: 0,
    place: 1,
    lapDisplay: 1,
    laps: LAPS,
    speed: 0,
    item: null,
    shield: false,
    boosting: false,
    drift: 0,
    banner: '',
    toast: '',
    rows: [],
    record: false,
    bestText: readBestText(),
    paused: false,
    playerName: RACERS[0].name,
    finishTime: 0
  }

  let racers: Racer[] = []
  let phase: Phase = 'menu'
  let paused = false
  let time = 0
  let raceTime = 0
  let countdownT = 0
  let celebrate = 0
  let menuAngle = 0.4
  let banner = ''
  let bannerTimer = 0
  let toast = ''
  let toastTimer = 0
  let shake = 0
  let queuedBoost = false
  let lastLamp = ''
  let recordNoted = false
  const camPos = new THREE.Vector3(0, 8, 20)
  const camLook = new THREE.Vector3()
  const camDesired = new THREE.Vector3()
  const focus = new THREE.Vector3()
  const aim = new THREE.Vector3()
  const fwd = new THREE.Vector3()
  const up = new THREE.Vector3()
  const right = new THREE.Vector3()
  const basis = new THREE.Matrix4()
  const lean = new THREE.Quaternion()
  const tmp = new THREE.Vector3()
  const LOCAL_Z = new THREE.Vector3(0, 0, 1)

  const crates = spawnCrates()
  const pads = spawnPads()
  const hazards: Hazard[] = []
  const lamps = spawnLamps()
  const pedestals = spawnPedestals()
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.5, 0.08, 8, 24),
    new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffd23f', emissiveIntensity: 0.7, roughness: 0.3 })
  )
  ring.rotation.x = Math.PI / 2
  scene.add(ring)

  const rockGeo = new THREE.DodecahedronGeometry(0.58, 0)
  const rockMat = new THREE.MeshStandardMaterial({ color: '#9aa5b1', roughness: 0.7 })
  const gustGeo = new THREE.SphereGeometry(0.46, 14, 12)
  const gustMat = new THREE.MeshStandardMaterial({
    color: '#4cc9f0',
    emissive: '#4cc9f0',
    emissiveIntensity: 0.8,
    roughness: 0.2
  })

  const map = minimap.getContext('2d')
  const mapBounds = boundsOf(track.minimap)

  rebuildField()
  camera.position.copy(camPos)

  renderer.domElement.addEventListener('pointerdown', () => {
    audio.resume()
    if (phase === 'countdown') controls.tap = true
  })

  const clock = new THREE.Clock()
  const resize = () => {
    const w = view.clientWidth || window.innerWidth
    const h = view.clientHeight || window.innerHeight
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
    renderer.setSize(w, h, false)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
  }
  window.addEventListener('resize', resize)
  resize()

  const api: Game = {
    controls,
    select(index: number) {
      hud.selected = ((index % RACERS.length) + RACERS.length) % RACERS.length
      if (phase === 'menu') rebuildField()
    },
    cycle(dir: number) {
      api.select(hud.selected + dir)
    },
    start() {
      if (phase !== 'menu' && phase !== 'podium') return
      audio.resume()
      beginCountdown()
    },
    again() {
      audio.resume()
      beginCountdown()
    },
    menu() {
      phase = 'menu'
      paused = false
      releaseKarts()
      rebuildField()
    },
    togglePause() {
      if (phase !== 'race' && phase !== 'countdown') return
      paused = !paused
    },
    toggleMute() {
      const next = !audio.muted()
      audio.setMuted(next)
      return next
    },
    hud: () => hud,
    resize
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as {
      __nova?: {
        finish: () => void
        start: () => void
        state: () => {
          phase: Phase
          length: number
          along: number
          travel: number
          laps: number
          speed: number
          lateral: number
          heading: number
          item: ItemId | null | undefined
          shield: boolean
          boost: number
          drift: number
          place: number
          hazards: number
        }
      }
    }).__nova = {
      start: () => api.start(),
      finish: () => {
        if (phase === 'menu') beginCountdown()
        phase = 'race'
        racers.forEach((racer, index) => {
          racer.travel = 800 - index * 40
          racer.finished = false
        })
        const player = racers.find((r) => r.isPlayer)
        if (!player) return
        player.finished = true
        player.laps = LAPS
        player.finishTime = 62.4
        raceTime = 62.4
        beginFinish()
        celebrate = 0.05
      },
      state: () => {
        const player = racers.find((r) => r.isPlayer)
        return {
          phase,
          length: track.length,
          along: player?.along ?? 0,
          travel: player?.travel ?? 0,
          laps: player?.laps ?? 0,
          speed: player?.speed ?? 0,
          lateral: player?.lateral ?? 0,
          heading: player?.heading ?? 0,
          item: player?.item,
          shield: player?.shield ?? false,
          boost: player?.boostTime ?? 0,
          drift: player?.drift ?? 0,
          place: player?.place ?? 0,
          hazards: hazards.length
        }
      }
    }
  }

  requestAnimationFrame(frame)
  return api

  function frame() {
    requestAnimationFrame(frame)
    const dt = Math.min(0.033, clock.getDelta())
    time += dt
    const sim = paused ? 0 : dt
    if (bannerTimer > 0) bannerTimer -= dt
    if (toastTimer > 0) toastTimer -= dt
    if (bannerTimer <= 0) banner = ''
    if (toastTimer <= 0) toast = ''

    if (phase === 'menu') updateMenu(sim)
    else if (phase === 'countdown') updateCountdown(sim)
    else if (phase === 'race' || phase === 'celebrate') updateRace(sim)
    else if (phase === 'podium') updatePodium(sim)

    updatePickups(paused ? 0 : dt)
    tickWater(track.group, time)
    tickClouds(track.group, paused ? 0 : dt)
    fx.update(dt)
    controls.tap = false
    controls.useItem = false
    updateLamps()
    drawMinimap()
    publishHud()
    renderer.render(scene, camera)
  }

  function updateMenu(dt: number) {
    menuAngle += dt * 0.28
    const anchor = track.length - 24
    track.pose(anchor, 0, 1.4, focus)
    camDesired.set(focus.x + Math.sin(menuAngle) * 18, focus.y + 7.2, focus.z + Math.cos(menuAngle) * 18)
    camPos.lerp(camDesired, 1 - Math.exp(-2 * dt))
    camera.position.copy(camPos)
    camera.lookAt(focus)
    camera.fov = lerp(camera.fov, 66, 0.08)
    camera.updateProjectionMatrix()
    lights.sun.position.set(focus.x + 40, focus.y + 80, focus.z + 24)
    lights.sun.target.position.copy(focus)
    racers.forEach((racer, index) => {
      const bob = racer.isPlayer ? Math.sin(time * 3) * 0.1 : 0
      placeKart(racer, bob)
      racer.view.wheels.forEach((wheel) => {
        wheel.rotation.x += dt * (1.5 + index * 0.1)
      })
    })
    const player = racers.find((r) => r.isPlayer)
    if (player) {
      ring.visible = true
      ring.position.copy(player.pos)
      ring.position.y = player.pos.y + 0.08
      ring.rotation.z = time
    }
    audio.update(dt, 0, false, false)
  }

  function updateCountdown(dt: number) {
    countdownT -= dt
    if (controls.tap) {
      if (countdownT <= 1 && countdownT > 0.05) queuedBoost = true
      else if (countdownT > 1) {
        toast = 'Too soon'
        toastTimer = 0.55
      }
      controls.tap = false
    }
    const label = countdownT > 3 ? '3' : countdownT > 2 ? '2' : countdownT > 1 ? '1' : 'GO'
    if (label !== lastLamp) {
      lastLamp = label
      banner = label
      bannerTimer = 0.9
      audio.beep(label === 'GO' ? 920 : 480, label === 'GO' ? 0.18 : 0.1)
    }
    racers.forEach((racer) => {
      placeKart(racer, 0)
      racer.view.wheels.forEach((wheel) => {
        wheel.rotation.x += dt * 8
      })
    })
    chaseCamera(dt, 0.5)
    if (countdownT <= 0) {
      phase = 'race'
      raceTime = 0
      banner = 'GO'
      bannerTimer = 0.6
      if (queuedBoost) {
        const player = racers.find((r) => r.isPlayer)
        if (player) giveBoost(player, 1.35 * player.def.boost, 1.36)
        banner = 'START BURST'
        bannerTimer = 1
        queuedBoost = false
      }
    }
  }

  function updateRace(dt: number) {
    if (phase === 'celebrate') {
      celebrate -= dt
      if (celebrate <= 0) showPodium()
    }
    const scaled = phase === 'celebrate' ? dt * 0.45 : dt
    if (scaled > 0) raceTime += phase === 'race' ? dt : scaled
    ring.visible = false
    racers.forEach((racer, index) => {
        if (racer.isPlayer && phase === 'race' && !racer.finished) {
        const steer = (controls.right ? 1 : 0) - (controls.left ? 1 : 0)
        integrate(racer, scaled, steer, controls.brake, controls.drift && Math.abs(steer) > 0)
        if (!paused && controls.useItem) useItem(racer, index)
      } else if (!racer.finished) {
        const intent = aiIntent(racer, index, scaled)
        integrate(racer, scaled, intent.steer, intent.brake, intent.drift, intent.target)
      } else {
        integrate(racer, scaled, 0, true, false)
        racer.speed = Math.min(racer.speed, 10)
      }
      racer.boostTime = Math.max(0, racer.boostTime - scaled)
      if (racer.boostTime <= 0) {
        racer.superBoost = false
        racer.boostPower = 1
      }
      racer.invuln = Math.max(0, racer.invuln - scaled)
      racer.padCd = Math.max(0, racer.padCd - scaled)
      racer.itemLock = Math.max(0, racer.itemLock - scaled)
      if (racer.spin > 0) racer.spin = Math.max(0, racer.spin - scaled)
    })
    resolveBumps()
    updateHazards(scaled)
    rank()
    racers.forEach((racer) => {
      placeKart(racer, 0)
      racer.view.wheels.forEach((wheel) => {
        wheel.rotation.x += racer.speed * scaled * 0.55
      })
      racer.view.steerPivots.forEach((pivot) => {
        pivot.rotation.y = racer.steerVisual * 0.42
      })
      racer.view.bubble.visible = racer.shield
      if (racer.shield) racer.view.bubble.scale.setScalar(1 + Math.sin(time * 7) * 0.05)
      const label = ordinal(racer.place)
      if (label !== racer.labelText) {
        racer.labelText = label
        racer.view.setLabel(label, racer.isPlayer)
      }
      if (racer.boostTime > 0) {
        tmp.copy(racer.pos)
        tmp.x -= Math.sin(racer.heading) * 1.15
        tmp.z -= Math.cos(racer.heading) * 1.15
        fx.trail(tmp, racer.superBoost ? '#ff5db1' : racer.def.accent)
      } else if (racer.drift > 0.12) {
        fx.trail(racer.pos, '#ffd23f')
      }
      if (Math.abs(racer.lateral) > ROAD_HALF && racer.isPlayer && Math.random() < scaled * 10) {
        fx.burst(racer.pos, '#e6c48a', 1, 2)
      }
    })
    animateCrates()
    chaseCamera(dt, phase === 'celebrate' ? 1 : 0)
    const player = racers.find((r) => r.isPlayer)
    audio.update(dt, player?.speed ?? 0, (player?.boostTime ?? 0) > 0, phase === 'race' && !paused)
  }

  function updatePodium(dt: number) {
    const pedestal = pedestals[0]
    pedestal.getWorldPosition(focus)
    focus.y += 1.6
    camDesired.copy(focus)
    camDesired.y += 2.8
    const outward = tmp.copy(focus)
    outward.y = 0
    if (outward.lengthSq() < 1) outward.set(0, 0, 1)
    outward.normalize()
    camDesired.addScaledVector(outward, 11)
    camPos.lerp(camDesired, 1 - Math.exp(-1.6 * dt))
    camera.position.copy(camPos)
    camera.lookAt(focus)
    if (Math.random() < dt * 18) {
      fx.burst(focus, ['#ffd23f', '#ff4d6d', '#4cc9f0', '#b8ff6a'][Math.floor(Math.random() * 4)], 3, 5)
    }
    lights.sun.target.position.copy(focus)
    lights.sun.position.set(focus.x + 20, focus.y + 40, focus.z + 10)
    audio.update(dt, 0, false, false)
  }

  function integrate(
    racer: Racer,
    dt: number,
    steer: number,
    brake: boolean,
    drifting: boolean,
    speedCap = Infinity
  ) {
    const off = Math.abs(racer.lateral) > ROAD_HALF
    const boosting = racer.boostTime > 0
    let maxSpeed = 27.5 * racer.def.speed
    if (boosting) maxSpeed *= racer.boostPower * (racer.superBoost ? 1 : racer.def.boost)
    if (off) maxSpeed *= 0.55
    if (racer.spin > 0) maxSpeed *= 0.35
    if (!racer.isPlayer) maxSpeed *= racer.aiSkill
    maxSpeed = Math.min(maxSpeed, speedCap)

    if (racer.spin > 0) {
      racer.speed *= Math.exp(-2 * dt)
      racer.heading += dt * 9
    } else if (brake && racer.speed > 0) {
      racer.speed = Math.max(-7, racer.speed - 36 * dt)
    } else if (brake) {
      racer.speed = Math.max(-7, racer.speed - 14 * dt)
    } else if (racer.speed < maxSpeed) {
      racer.speed = Math.min(maxSpeed, racer.speed + 26 * racer.def.accel * dt)
    } else {
      racer.speed = Math.max(maxSpeed, racer.speed - 12 * dt)
    }

    const speedFactor = clamp(Math.abs(racer.speed) / 15, 0.32, 1)
    const turnScale = racer.isPlayer ? 1.55 : 2.05
    let turn = steer * turnScale * racer.def.grip * speedFactor
    if (drifting && racer.spin <= 0 && racer.speed > 8) {
      turn *= 1.38
      racer.drift = clamp(racer.drift + dt * 0.72, 0, 1)
      racer.slide += steer * 18 * dt
    } else if (!drifting && racer.drift > 0.32 && racer.spin <= 0) {
      const strong = racer.drift > 0.78
      giveBoost(racer, (strong ? 0.95 : 0.48) * racer.def.boost, strong ? 1.32 : 1.16)
      racer.drift = 0
    } else {
      racer.drift = Math.max(0, racer.drift - dt * 1.5)
    }
    racer.steerVisual = lerp(racer.steerVisual, steer, 1 - Math.exp(-10 * dt))
    racer.heading = wrapAngle(racer.heading + turn * dt * (racer.speed >= 0 ? 1 : -0.45))
    racer.slide *= Math.exp(-3 * dt)

    const nx = racer.pos.x + Math.sin(racer.heading) * racer.speed * dt + Math.cos(racer.heading) * racer.slide * dt
    const nz = racer.pos.z + Math.cos(racer.heading) * racer.speed * dt - Math.sin(racer.heading) * racer.slide * dt
    tmp.set(nx, racer.pos.y, nz)
    const proj = track.project(tmp, racer.hint)
    let lateral = proj.lateral
    const limit = ROAD_HALF + 2.4
    const hitWall = Math.abs(lateral) > limit
    const tangent = proj.tangent.clone()
    const tangentHeading = Math.atan2(tangent.x, tangent.z)
    if (hitWall) {
      if (!racer.walled && racer.isPlayer) shake = Math.max(shake, 0.22)
      const sign = Math.sign(lateral) || 1
      lateral = sign * limit
      racer.heading = wrapAngle(racer.heading + wrapAngle(tangentHeading - racer.heading) * Math.min(1, 10 * dt))
      racer.slide = -sign * 6
      const scrape = maxSpeed * 0.78
      if (racer.speed > scrape) racer.speed -= Math.min(racer.speed - scrape, 22 * dt)
    }
    if (racer.isPlayer && racer.spin <= 0) {
      const auto = 3.1 * (1 - Math.min(1, Math.abs(steer)) * 0.82)
      racer.heading = wrapAngle(racer.heading + wrapAngle(tangentHeading - racer.heading) * Math.min(1, auto * dt))
      if (Math.abs(lateral) > ROAD_HALF * 0.82) {
        lateral -= Math.sign(lateral) * Math.min(Math.abs(lateral) - ROAD_HALF * 0.55, 14 * dt)
      }
    }
    racer.walled = hitWall
    const point = proj.point.clone()
    const rightV = proj.right.clone()
    const normal = proj.normal.clone()
    const along = proj.along
    const hint = proj.index
    racer.hopV -= 16 * dt
    racer.hop += racer.hopV * dt
    if (racer.hop < 0) {
      racer.hop = 0
      racer.hopV = 0
    }
    racer.pos.copy(point).addScaledVector(rightV, lateral).addScaledVector(normal, 0.15 + racer.hop)
    const prevAlong = racer.along
    racer.along = along
    racer.lateral = lateral
    racer.hint = hint

    if (phase !== 'race' && phase !== 'celebrate') return
    let delta = alongDelta(racer.along, prevAlong, track.length)
    const maxStep = (Math.abs(racer.speed) + Math.abs(racer.slide) + 25) * dt + 0.75
    delta = clamp(delta, -maxStep, maxStep)
    racer.travel += Math.max(0, delta)
    racer.sinceLine += delta
    const crossed = prevAlong > track.length * 0.7 && racer.along < track.length * 0.25
    if (crossed && !racer.finished && racer.sinceLine > track.length * 0.45) {
      racer.laps += 1
      racer.sinceLine = 0
      if (racer.laps >= LAPS) {
        racer.finished = true
        racer.finishTime = raceTime
        if (racer.isPlayer) beginFinish()
      } else if (racer.isPlayer) {
        banner = racer.laps === LAPS - 1 ? 'FINAL LAP' : `LAP ${racer.laps + 1}`
        bannerTimer = 1.25
        audio.beep(700, 0.14)
      }
    }
  }

  function aiIntent(
    racer: Racer,
    index: number,
    dt: number
  ): { steer: number; brake: boolean; drift: boolean; target: number } {
    const look = 8.5 + racer.speed * 0.38
    const line = Math.sin(racer.along * 0.05 + index * 1.7) * 2.5
    track.pose(racer.along + look, line, 0.4, aim)
    const desired = Math.atan2(aim.x - racer.pos.x, aim.z - racer.pos.z)
    const diff = wrapAngle(desired - racer.heading)
    const steer = clamp(diff * 2.6, -1, 1)
    const sharp = Math.abs(diff)
    let target = 27.5 * racer.def.speed * racer.aiSkill
    target *= 1 - clamp(sharp * 0.9, 0, 0.42)
    const player = racers.find((r) => r.isPlayer)
    if (player) {
      const gap = player.travel - racer.travel
      if (gap > 36) target *= 1.04
      if (gap < -16) target *= 0.9
      if (gap < -36) target *= 0.84
    }
    const brake = sharp > 0.45 && racer.speed > target
    if (racer.aiDrift > 0) racer.aiDrift -= dt
    else if (sharp > 0.7 && racer.speed > 12) racer.aiDrift = 0.48
    if (racer.item && racer.itemLock <= 0 && racer.spin <= 0) {
      const crowded = racers.some((other) => {
        if (other === racer || other.finished) return false
        const gap = alongDelta(racer.along, other.along, track.length)
        return gap > 0 && gap < 16 && Math.abs(other.lateral - racer.lateral) < 3
      })
      const use =
        racer.item === 'spark' ||
        racer.item === 'bloom' ||
        racer.item === 'gust' ||
        (racer.item === 'bubble' && racer.place <= 4) ||
        (racer.item === 'pebble' && crowded)
      if (use) useItem(racer, index)
    }
    return { steer, brake, drift: racer.aiDrift > 0, target }
  }

  function resolveBumps() {
    for (let i = 0; i < racers.length; i++) {
      for (let j = i + 1; j < racers.length; j++) {
        const a = racers[i]
        const b = racers[j]
        if (a.finished || b.finished) continue
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const dist = Math.hypot(dx, dz)
        const min = 1.45
        if (dist > min || dist < 1e-4) continue
        const push = (min - dist) * 0.35
        const nx = dx / dist
        const nz = dz / dist
        const aPush = a.isPlayer ? 0.28 : 1
        const bPush = b.isPlayer ? 0.28 : 1
        a.pos.x -= nx * push * aPush
        a.pos.z -= nz * push * aPush
        b.pos.x += nx * push * bPush
        b.pos.z += nz * push * bPush
        if (a.speed > b.speed) b.speed *= 0.97
        else a.speed *= 0.97
        if (a.isPlayer || b.isPlayer) shake = Math.max(shake, 0.08)
      }
    }
  }

  function updatePickups(dt: number) {
    for (const crate of crates) {
      if (!crate.active) {
        crate.wait -= dt
        if (crate.wait <= 0) {
          crate.active = true
          crate.mesh.visible = true
        }
      }
      const bob = crate.active ? Math.sin(time * 3 + crate.along) * 0.25 : 0
      track.pose(crate.along, crate.lateral, 1.05 + bob, crate.mesh.position)
      if (crate.active) crate.mesh.rotation.y += dt * 1.6
      const racing = phase === 'race' || phase === 'celebrate'
      if (!crate.active || !racing) continue
      for (const racer of racers) {
        if (racer.finished || racer.item || racer.itemLock > 0) continue
        if (crate.mesh.position.distanceTo(racer.pos) > 2.7) continue
        crate.active = false
        crate.wait = 7.5
        crate.mesh.visible = false
        racer.item = rollItem(racer.place, racer.def.luck, Math.random)
        racer.itemLock = 0.35
        fx.burst(racer.pos, ITEMS[racer.item].color, 20, 7)
        if (racer.isPlayer) {
          audio.item()
          toast = ITEMS[racer.item].name
          toastTimer = 1.35
          shake = Math.max(shake, 0.14)
        }
      }
    }
    for (const pad of pads) {
      track.pose(pad.along, 0, 0.12, pad.mesh.position)
      const frame = track.frame(pad.along)
      basis.makeBasis(frame.right, frame.normal, frame.tangent)
      pad.mesh.quaternion.setFromRotationMatrix(basis)
      const racing = phase === 'race' || phase === 'celebrate'
      if (!racing) continue
      for (const racer of racers) {
        if (racer.padCd > 0 || racer.finished) continue
        if (Math.abs(alongDelta(racer.along, pad.along, track.length)) < 4.5 && Math.abs(racer.lateral) < ROAD_HALF - 0.4) {
          giveBoost(racer, 0.7, 1.2)
          racer.padCd = 1.5
        }
      }
    }
  }

  function updateHazards(dt: number) {
    for (let i = hazards.length - 1; i >= 0; i--) {
      const hazard = hazards[i]
      hazard.life -= dt
      if (hazard.kind === 'gust') {
        hazard.along += 48 * dt
        let prey: Racer | null = null
        let best = 22
        for (const racer of racers) {
          if (racers[hazard.owner] === racer || racer.finished) continue
          const gap = alongDelta(racer.along, hazard.along, track.length)
          if (gap > 0 && gap < best) {
            best = gap
            prey = racer
          }
        }
        if (prey) hazard.lateral += clamp(prey.lateral - hazard.lateral, -1, 1) * 9 * dt
      }
      track.pose(hazard.along, hazard.lateral, hazard.kind === 'gust' ? 0.85 : 0.45, hazard.mesh.position)
      if (hazard.kind === 'gust') hazard.mesh.rotation.y += dt * 6
      if (hazard.life <= 0) {
        scene.remove(hazard.mesh)
        hazards.splice(i, 1)
        continue
      }
      for (const racer of racers) {
        if (racer.finished || racers[hazard.owner] === racer) continue
        if (hazard.kind === 'rock' && hazard.life > 9.2) continue
        if (hazard.mesh.position.distanceTo(racer.pos) < (hazard.kind === 'gust' ? 1.35 : 1.25)) {
          hitRacer(racer, hazard.kind === 'gust' ? '#4cc9f0' : '#c5ccd6')
          scene.remove(hazard.mesh)
          hazards.splice(i, 1)
          break
        }
      }
    }
  }

  function useItem(racer: Racer, index: number) {
    if (!racer.item || racer.spin > 0) return
    const id = racer.item
    racer.item = null
    if (id === 'spark') giveBoost(racer, 1.65, 1.3)
    else if (id === 'bloom') giveBoost(racer, 2.45, 1.48, true)
    else if (id === 'bubble') {
      racer.shield = true
      if (racer.isPlayer) audio.item()
    } else if (id === 'pebble') {
      hazards.push({
        along: racer.along - 3.4,
        lateral: racer.lateral,
        life: 10,
        owner: index,
        kind: 'rock',
        mesh: new THREE.Mesh(rockGeo, rockMat)
      })
      scene.add(hazards[hazards.length - 1].mesh)
      if (racer.isPlayer) audio.item()
    } else if (id === 'gust') {
      const mesh = new THREE.Mesh(gustGeo, gustMat)
      hazards.push({
        along: racer.along + 2.4,
        lateral: racer.lateral,
        life: 2.3,
        owner: index,
        kind: 'gust',
        mesh
      })
      scene.add(mesh)
      if (racer.isPlayer) audio.boost()
    }
    fx.burst(racer.pos, ITEMS[id].color, 16, 6)
  }

  function hitRacer(racer: Racer, color: string) {
    if (racer.finished || racer.superBoost || racer.invuln > 0) return
    if (racer.shield) {
      racer.shield = false
      racer.invuln = 0.4
      fx.burst(racer.pos, '#d8fff6', 14, 5)
      if (racer.isPlayer) audio.beep(320, 0.12)
      return
    }
    racer.spin = 0.9
    racer.speed *= 0.4
    racer.invuln = 1.05
    racer.drift = 0
    fx.burst(racer.pos, color, 18, 7)
    if (racer.isPlayer) {
      shake = Math.max(shake, 0.55)
      audio.hit()
      banner = 'SPUN OUT'
      bannerTimer = 0.7
    }
  }

  function giveBoost(racer: Racer, duration: number, power: number, superBoost = false) {
    if (power >= racer.boostPower || racer.boostTime <= 0) racer.boostPower = power
    racer.boostTime = Math.max(racer.boostTime, duration)
    if (superBoost) racer.superBoost = true
    racer.hopV = Math.max(racer.hopV, superBoost ? 4.2 : 2.8)
    if (racer.isPlayer) {
      shake = Math.max(shake, superBoost ? 0.4 : 0.22)
      audio.boost()
    }
  }

  function rank() {
    const sorted = [...racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime
      if (a.finished) return -1
      if (b.finished) return 1
      return b.travel - a.travel
    })
    sorted.forEach((racer, index) => {
      racer.place = index + 1
    })
    hud.rows = sorted.map((racer) => ({
      name: racer.def.name,
      place: racer.place,
      isPlayer: racer.isPlayer,
      finished: racer.finished,
      time: racer.finishTime,
      color: racer.def.body
    }))
  }

  function chaseCamera(dt: number, pullback: number) {
    const player = racers.find((r) => r.isPlayer)
    if (!player) return
    const back = 8.2 + pullback * 3.5 - Math.min(1.4, player.speed * 0.04)
    const height = 3.5 + pullback * 1.4
    camDesired.set(
      player.pos.x - Math.sin(player.heading) * back,
      player.pos.y + height,
      player.pos.z - Math.cos(player.heading) * back
    )
    camPos.lerp(camDesired, 1 - Math.exp(-3.4 * dt))
    camLook.set(
      player.pos.x + Math.sin(player.heading) * 6,
      player.pos.y + 1.1,
      player.pos.z + Math.cos(player.heading) * 6
    )
    camera.position.copy(camPos)
    if (shake > 0.004) {
      camera.position.x += (Math.random() - 0.5) * shake
      camera.position.y += (Math.random() - 0.5) * shake
      shake *= Math.exp(-4.8 * dt)
    } else shake = 0
    camera.lookAt(camLook)
    const wantFov = player.boostTime > 0 ? 78 : 66
    camera.fov = lerp(camera.fov, wantFov, 1 - Math.exp(-4 * dt))
    camera.updateProjectionMatrix()
    lights.sun.position.set(player.pos.x + 36, player.pos.y + 72, player.pos.z + 22)
    lights.sun.target.position.copy(player.pos)
  }

  function placeKart(racer: Racer, bob: number) {
    const proj = track.project(racer.pos, racer.hint)
    up.copy(proj.normal)
    fwd.set(Math.sin(racer.heading), 0, Math.cos(racer.heading))
    fwd.addScaledVector(up, -fwd.dot(up))
    if (fwd.lengthSq() < 1e-5) fwd.copy(proj.tangent)
    fwd.normalize()
    right.crossVectors(up, fwd).normalize()
    basis.makeBasis(right, up, fwd)
    racer.view.group.quaternion.setFromRotationMatrix(basis)
    lean.setFromAxisAngle(LOCAL_Z, -racer.steerVisual * 0.18)
    racer.view.group.quaternion.multiply(lean)
    racer.view.group.position.copy(racer.pos)
    racer.view.group.position.y += bob
  }

  function beginCountdown() {
    releaseKarts()
    resetRaceState()
    layoutGrid()
    phase = 'countdown'
    paused = false
    countdownT = 4
    lastLamp = ''
    queuedBoost = false
    recordNoted = false
    banner = '3'
    bannerTimer = 0.8
    celebrate = 0
    raceTime = 0
  }

  function beginFinish() {
    if (phase === 'celebrate' || phase === 'podium') return
    phase = 'celebrate'
    celebrate = 1.65
    banner = 'FINISH'
    bannerTimer = 1.5
    shake = Math.max(shake, 0.45)
    audio.fanfare()
  }

  function showPodium() {
    phase = 'podium'
    rank()
    const sorted = [...racers].sort((a, b) => a.place - b.place)
    const heights = [1.7, 1.15, 0.78]
    sorted.forEach((racer, index) => {
      if (index < 3) {
        pedestals[index].add(racer.view.group)
        racer.view.group.visible = true
        racer.view.group.position.set(0, heights[index], 0)
        racer.view.group.quaternion.setFromEuler(new THREE.Euler(0, Math.PI / 2, 0))
        racer.view.setLabel(racer.def.name, racer.isPlayer)
        racer.labelText = racer.def.name
      } else {
        racer.view.group.visible = false
      }
    })
    const player = racers.find((r) => r.isPlayer)
    hud.record = false
    if (player?.finished && !recordNoted) {
      recordNoted = true
      const best = readBest()
      if (!best || player.finishTime < best.time) {
        writeBest(player.finishTime, player.def.name)
        hud.record = true
        hud.bestText = `${player.def.name} ${formatTime(player.finishTime)}`
      }
    }
    fx.burst(focus, '#ffd23f', 30, 8)
  }

  function rebuildField() {
    for (const racer of racers) scene.remove(racer.view.group)
    const selected = RACERS[hud.selected]
    hud.playerName = selected.name
    racers = buildField(selected.id).map((entry, index) => createRuntime(entry.def, entry.isPlayer, index))
    for (const racer of racers) scene.add(racer.view.group)
    resetRaceState()
    layoutGrid()
  }

  function createRuntime(def: RacerDef, isPlayer: boolean, index: number): Racer {
    const view = createRacerMesh(def, String(index + 1))
    view.setLabel(isPlayer ? def.name : def.name, isPlayer)
    return {
      def,
      isPlayer,
      view,
      speed: 0,
      heading: 0,
      pos: new THREE.Vector3(),
      hint: 0,
      along: 0,
      lateral: 0,
      travel: 0,
      laps: 0,
      finished: false,
      finishTime: 0,
      sinceLine: 0,
      item: null,
      shield: false,
      boostTime: 0,
      boostPower: 1,
      superBoost: false,
      invuln: 0,
      spin: 0,
      drift: 0,
      slide: 0,
      hop: 0,
      hopV: 0,
      padCd: 0,
      itemLock: 0,
      place: index + 1,
      aiSkill: 0.83 + (index % 5) * 0.018,
      aiDrift: 0,
      steerVisual: 0,
      labelText: def.name,
      walled: false
    }
  }

  function resetRaceState() {
    for (const racer of racers) {
      racer.speed = 0
      racer.travel = 0
      racer.laps = 0
      racer.finished = false
      racer.finishTime = 0
      racer.sinceLine = 0
      racer.item = null
      racer.shield = false
      racer.boostTime = 0
      racer.boostPower = 1
      racer.superBoost = false
      racer.invuln = 0
      racer.spin = 0
      racer.drift = 0
      racer.slide = 0
      racer.hop = 0
      racer.hopV = 0
      racer.padCd = 0
      racer.itemLock = 0
      racer.steerVisual = 0
      racer.view.bubble.visible = false
      racer.view.group.visible = true
    }
    for (const hazard of hazards) scene.remove(hazard.mesh)
    hazards.length = 0
    for (const crate of crates) {
      crate.active = true
      crate.wait = 0
      crate.mesh.visible = true
    }
  }

  function layoutGrid() {
    racers.forEach((racer, index) => {
      const row = Math.floor(index / 2)
      const side = index % 2 === 0 ? -2.15 : 2.15
      const along = track.length - 12 - row * 6.5
      track.pose(along, side, 0.15, racer.pos)
      const frame = track.frame(along)
      racer.heading = Math.atan2(frame.tangent.x, frame.tangent.z)
      racer.along = frame.along
      racer.lateral = side
      racer.hint = frame.index
      racer.sinceLine = 0
      placeKart(racer, 0)
      const label = racer.def.name
      racer.labelText = label
      racer.view.setLabel(label, racer.isPlayer)
    })
  }

  function releaseKarts() {
    for (const racer of racers) {
      scene.add(racer.view.group)
      racer.view.group.visible = true
    }
  }

  function publishHud() {
    const player = racers.find((r) => r.isPlayer)
    hud.phase = phase
    hud.paused = paused
    hud.banner = banner
    hud.toast = toast
    hud.playerName = player?.def.name ?? hud.playerName
    hud.place = player?.place ?? 1
    hud.lapDisplay = Math.min(LAPS, (player?.laps ?? 0) + (player?.finished ? 0 : 1))
    hud.speed = Math.max(0, Math.round((player?.speed ?? 0) * 7.1))
    hud.item = player?.item ?? null
    hud.shield = player?.shield ?? false
    hud.boosting = (player?.boostTime ?? 0) > 0
    hud.drift = player?.drift ?? 0
    hud.finishTime = player?.finishTime ?? 0
    if (phase !== 'podium') rank()
  }

  function updateLamps() {
    const on = [false, false, false]
    let color = '#ff4d6d'
    if (phase === 'countdown') {
      if (countdownT <= 4) on[0] = true
      if (countdownT <= 3) on[1] = true
      if (countdownT <= 2) on[2] = true
      if (countdownT <= 1) color = '#7dff6a'
    }
    lamps.forEach((lamp, index) => {
      const mat = lamp.material as THREE.MeshStandardMaterial
      const lit = on[index]
      mat.color.set(lit ? color : '#3a2428')
      mat.emissive.set(lit ? color : '#14080a')
      mat.emissiveIntensity = lit ? 1.5 : 0.15
    })
  }

  function animateCrates() {
    crates.forEach((crate) => {
      const bolt = crate.mesh.children[1]
      if (bolt) bolt.rotation.y += 0.02
    })
  }

  function drawMinimap() {
    if (!map) return
    const w = minimap.width
    const h = minimap.height
    map.clearRect(0, 0, w, h)
    map.fillStyle = 'rgba(27, 36, 55, 0.55)'
    map.beginPath()
    map.arc(w / 2, h / 2, w / 2 - 2, 0, Math.PI * 2)
    map.fill()
    const { minX, minZ, span } = mapBounds
    const project = (x: number, z: number) => {
      const nx = (x - minX) / span
      const nz = (z - minZ) / span
      return [14 + nx * (w - 28), h - 14 - nz * (h - 28)] as const
    }
    map.lineJoin = 'round'
    map.lineCap = 'round'
    map.beginPath()
    track.minimap.forEach(([x, z], index) => {
      const [px, py] = project(x, z)
      if (index === 0) map.moveTo(px, py)
      else map.lineTo(px, py)
    })
    map.closePath()
    map.strokeStyle = '#ff8fab'
    map.lineWidth = 8
    map.stroke()
    map.strokeStyle = '#f4f7fb'
    map.lineWidth = 4
    map.stroke()
    for (const racer of racers) {
      const [px, py] = project(racer.pos.x, racer.pos.z)
      map.beginPath()
      map.fillStyle = racer.isPlayer ? '#ffd23f' : racer.def.body
      map.arc(px, py, racer.isPlayer ? 5.5 : 3.6, 0, Math.PI * 2)
      map.fill()
      if (racer.isPlayer) {
        map.strokeStyle = '#1b2437'
        map.lineWidth = 2
        map.stroke()
      }
    }
  }

  function spawnCrates(): Crate[] {
    const spots = [0.035, 0.14, 0.24, 0.36, 0.48, 0.61, 0.74, 0.88]
    return spots.map((fraction, index) => {
      const mesh = crateMesh()
      scene.add(mesh)
      return {
        along: track.length * fraction,
        lateral: index === 0 ? 0 : index % 2 === 0 ? -2.1 : 2.1,
        mesh,
        active: true,
        wait: 0
      }
    })
  }

  function spawnPads(): Pad[] {
    return [0.06, 0.36, 0.62, 0.84].map((fraction) => {
      const mesh = padMesh()
      scene.add(mesh)
      return { along: track.length * fraction, mesh }
    })
  }

  function spawnLamps(): THREE.Mesh[] {
    return [0, 1, 2].map((index) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 12, 10),
        new THREE.MeshStandardMaterial({ color: '#3a2428', emissive: '#14080a', emissiveIntensity: 0.2, roughness: 0.4 })
      )
      track.pose(1.2, -1.6 + index * 1.6, 4.7, mesh.position)
      scene.add(mesh)
      return mesh
    })
  }

  function spawnPedestals(): THREE.Group[] {
    const specs = [
      { along: 24, lateral: ROAD_HALF + 12, height: 1.7, color: '#ffd23f' },
      { along: 19, lateral: ROAD_HALF + 16.2, height: 1.15, color: '#e7edf5' },
      { along: 29, lateral: ROAD_HALF + 16.2, height: 0.78, color: '#e7a06a' }
    ]
    return specs.map((spec) => {
      const group = new THREE.Group()
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(1.25, 1.45, spec.height, 8),
        new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.42 })
      )
      drum.position.y = spec.height / 2
      drum.castShadow = true
      drum.receiveShadow = true
      group.add(drum)
      track.pose(spec.along, spec.lateral, 0, group.position)
      const frame = track.frame(spec.along)
      basis.makeBasis(frame.right, frame.normal, frame.tangent)
      group.quaternion.setFromRotationMatrix(basis)
      scene.add(group)
      return group
    })
  }
}

function crateMesh(): THREE.Group {
  const group = new THREE.Group()
  const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 1.15, 1.15),
    new THREE.MeshStandardMaterial({
      color: '#fff4d2',
      emissive: '#ffb703',
      emissiveIntensity: 0.35,
      roughness: 0.4,
      map: boltTexture()
    })
  )
  box.castShadow = true
  const cap = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.28, 0),
    new THREE.MeshStandardMaterial({ color: '#ff4d6d', emissive: '#ff4d6d', emissiveIntensity: 0.5, roughness: 0.3 })
  )
  cap.position.y = 0.85
  group.add(box, cap)
  return group
}

function padMesh(): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: '#ffe066',
    emissive: '#ffb703',
    emissiveIntensity: 0.85,
    roughness: 0.35
  })
  for (let i = 0; i < 3; i++) {
    const chevron = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.28), mat)
    chevron.position.set(0, 0, -0.8 + i * 0.7)
    chevron.rotation.y = 0.55
    const twin = chevron.clone()
    twin.rotation.y = -0.55
    twin.position.x = 0
    group.add(chevron, twin)
  }
  return group
}

function boltTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffe8a3'
  ctx.fillRect(0, 0, 128, 128)
  ctx.strokeStyle = '#ff4d6d'
  ctx.lineWidth = 10
  ctx.strokeRect(8, 8, 112, 112)
  ctx.fillStyle = '#ff4d6d'
  ctx.beginPath()
  ctx.moveTo(74, 16)
  ctx.lineTo(40, 70)
  ctx.lineTo(62, 70)
  ctx.lineTo(50, 112)
  ctx.lineTo(96, 52)
  ctx.lineTo(72, 52)
  ctx.closePath()
  ctx.fill()
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function boundsOf(points: Array<[number, number]>): { minX: number; minZ: number; span: number } {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const [x, z] of points) {
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z)
    maxZ = Math.max(maxZ, z)
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1)
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  return { minX: cx - span / 2, minZ: cz - span / 2, span }
}

function readBest(): { time: number; name: string } | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { time?: number; name?: string }
    if (typeof parsed.time !== 'number' || typeof parsed.name !== 'string') return null
    return { time: parsed.time, name: parsed.name }
  } catch {
    return null
  }
}

function readBestText(): string {
  const best = readBest()
  return best ? `${best.name} ${formatTime(best.time)}` : 'No record yet'
}

function writeBest(time: number, name: string) {
  localStorage.setItem(RECORD_KEY, JSON.stringify({ time, name }))
}
