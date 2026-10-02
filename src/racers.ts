import * as THREE from 'three'

export type Silhouette = 'sparrow' | 'beetle' | 'kite' | 'owl' | 'hare' | 'pup'

export type RacerDef = {
  id: string
  name: string
  title: string
  blurb: string
  accel: number
  speed: number
  grip: number
  boost: number
  luck: number
  weight: number
  body: string
  accent: string
  trim: string
  rider: string
  riderInk: string
  kind: Silhouette
}

export const RACERS: RacerDef[] = [
  {
    id: 'quill',
    name: 'Quill Swift',
    title: 'Featherweight Ace',
    blurb: 'Snappy off the line. Lives for tight corners and early crates.',
    accel: 1.18,
    speed: 0.96,
    grip: 1.06,
    boost: 1.05,
    luck: 1,
    weight: 0.82,
    body: '#ff6b3d',
    accent: '#ffd23f',
    trim: '#fff1d0',
    rider: '#ffe0c2',
    riderInk: '#3a2418',
    kind: 'sparrow'
  },
  {
    id: 'moss',
    name: 'Moss Bumper',
    title: 'Grip Garden',
    blurb: 'A round beetle who refuses to slide. Heavy, calm, and sticky.',
    accel: 0.84,
    speed: 1.02,
    grip: 1.28,
    boost: 0.96,
    luck: 1,
    weight: 1.28,
    body: '#2f9e44',
    accent: '#ffe066',
    trim: '#d8f3dc',
    rider: '#8d5a3c',
    riderInk: '#1d120c',
    kind: 'beetle'
  },
  {
    id: 'luma',
    name: 'Luma Vane',
    title: 'Glass Rocket',
    blurb: 'Highest top speed on the ridge. Treat the corners like suggestions.',
    accel: 1.02,
    speed: 1.16,
    grip: 0.8,
    boost: 1.08,
    luck: 0.95,
    weight: 0.9,
    body: '#3ec5ef',
    accent: '#f72585',
    trim: '#e7fbff',
    rider: '#e7fbff',
    riderInk: '#12323a',
    kind: 'kite'
  },
  {
    id: 'nix',
    name: 'Nix Hoot',
    title: 'Midnight Balance',
    blurb: 'Even stats, uneven luck. Crates open a little kinder.',
    accel: 1,
    speed: 1,
    grip: 1.08,
    boost: 1.02,
    luck: 1.38,
    weight: 1,
    body: '#5b4ed1',
    accent: '#ffd6a5',
    trim: '#efe9ff',
    rider: '#d5c7ff',
    riderInk: '#1a1333',
    kind: 'owl'
  },
  {
    id: 'cinder',
    name: 'Cinder Hop',
    title: 'Ember Boost',
    blurb: 'Turns drift sparks into longer bursts. Always slightly on fire.',
    accel: 1.1,
    speed: 1.06,
    grip: 0.92,
    boost: 1.28,
    luck: 1.05,
    weight: 0.88,
    body: '#ff7b00',
    accent: '#ff2e63',
    trim: '#fff0d8',
    rider: '#ffd0b0',
    riderInk: '#3a160c',
    kind: 'hare'
  },
  {
    id: 'pebble',
    name: 'Pebble Dumpling',
    title: 'Stone Steady',
    blurb: 'A pup in a brick of a buggy. Shrugs off bumps and holds the line.',
    accel: 0.92,
    speed: 0.98,
    grip: 1.18,
    boost: 1,
    luck: 1.08,
    weight: 1.22,
    body: '#6d7d8b',
    accent: '#7bdff2',
    trim: '#f4f7fb',
    rider: '#f3d2b3',
    riderInk: '#2a2118',
    kind: 'pup'
  }
]

export type RacerMesh = {
  group: THREE.Group
  wheels: THREE.Object3D[]
  steerPivots: THREE.Object3D[]
  bubble: THREE.Mesh
  label: THREE.Sprite
  setLabel: (text: string, hot: boolean) => void
}

const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.28, 12)
wheelGeo.rotateZ(Math.PI / 2)
const eyeWhiteGeo = new THREE.SphereGeometry(0.09, 10, 8)
const pupilGeo = new THREE.SphereGeometry(0.045, 8, 6)

export function createRacerMesh(def: RacerDef, plate: string): RacerMesh {
  const group = new THREE.Group()
  group.name = def.id
  const scale = 0.9 + def.weight * 0.12
  group.scale.setScalar(scale)

  const bodyMat = standard(def.body, 0.42)
  const accentMat = standard(def.accent, 0.38, def.accent, 0.18)
  const trimMat = standard(def.trim, 0.5)
  const riderMat = standard(def.rider, 0.62)
  const inkMat = standard(def.riderInk, 0.4)
  const wheelMat = standard('#1b1e27', 0.7)
  const hubMat = standard(def.trim, 0.35)

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.38, 2.05), bodyMat)
  chassis.position.set(0, 0.58, 0)
  chassis.castShadow = true
  group.add(chassis)

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.22, 0.7), accentMat)
  hood.position.set(0, 0.72, 0.62)
  hood.castShadow = true
  group.add(hood)

  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.92, 0.32, 0.08),
    new THREE.MeshStandardMaterial({
      color: '#dffaff',
      transparent: true,
      opacity: 0.55,
      roughness: 0.05,
      metalness: 0.05
    })
  )
  glass.position.set(0, 0.96, 0.42)
  group.add(glass)

  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.32), accentMat)
  spoiler.position.set(0, 1.02, -0.82)
  spoiler.castShadow = true
  group.add(spoiler)
  for (const x of [-0.42, 0.42]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.08), trimMat)
    post.position.set(x, 0.86, -0.82)
    group.add(post)
  }

  const plateMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.28),
    new THREE.MeshBasicMaterial({ map: plateTexture(plate, def.accent, def.riderInk) })
  )
  plateMesh.position.set(0, 0.62, -1.04)
  plateMesh.rotation.y = Math.PI
  group.add(plateMesh)

  const wheels: THREE.Object3D[] = []
  const steerPivots: THREE.Object3D[] = []
  const wheelSpots: Array<[number, number, boolean]> = [
    [-0.62, 0.62, true],
    [0.62, 0.62, true],
    [-0.62, -0.68, false],
    [0.62, -0.68, false]
  ]
  for (const [x, z, steer] of wheelSpots) {
    const pivot = new THREE.Group()
    pivot.position.set(x, 0.34, z)
    const wheel = new THREE.Mesh(wheelGeo, wheelMat)
    wheel.castShadow = true
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.3, 8), hubMat)
    hub.rotation.z = Math.PI / 2
    wheel.add(hub)
    pivot.add(wheel)
    group.add(pivot)
    wheels.push(wheel)
    if (steer) steerPivots.push(pivot)
  }

  addRider(group, def, riderMat, inkMat, accentMat)

  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(1.25, 18, 14),
    new THREE.MeshStandardMaterial({
      color: '#c8fff4',
      emissive: '#7dffe8',
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.28,
      roughness: 0.05,
      depthWrite: false
    })
  )
  bubble.position.y = 0.8
  bubble.visible = false
  group.add(bubble)

  const label = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: labelTexture(def.name, true),
      transparent: true,
      depthWrite: false
    })
  )
  label.position.set(0, 2.15, 0)
  label.scale.set(2.6, 0.62, 1)
  group.add(label)

  const setLabel = (text: string, hot: boolean) => {
    const material = label.material as THREE.SpriteMaterial
    const previous = material.map
    material.map = labelTexture(text, hot)
    material.needsUpdate = true
    previous?.dispose()
  }

  return { group, wheels, steerPivots, bubble, label, setLabel }
}

function addRider(
  group: THREE.Group,
  def: RacerDef,
  riderMat: THREE.Material,
  inkMat: THREE.Material,
  accentMat: THREE.Material
): void {
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), riderMat)
  head.position.set(0, 1.22, -0.02)
  head.castShadow = true
  group.add(head)
  addEyes(group, 1.28, 0.24, def.kind === 'owl' ? 0.16 : 0.12, inkMat)

  if (def.kind === 'sparrow') {
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 8), accentMat)
    beak.position.set(0, 1.18, 0.36)
    beak.rotation.x = Math.PI / 2
    group.add(beak)
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 6), accentMat)
    crest.position.set(0, 1.52, -0.02)
    group.add(crest)
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.08, 0.42), accentMat)
      wing.position.set(side * 0.78, 0.78, -0.05)
      wing.rotation.z = side * -0.5
      wing.rotation.y = side * 0.3
      group.add(wing)
    }
  }

  if (def.kind === 'beetle') {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), accentMat)
    shell.scale.set(1.15, 0.72, 1.05)
    shell.position.set(0, 0.95, -0.15)
    shell.castShadow = true
    group.add(shell)
    for (const side of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 6), inkMat)
      ant.position.set(side * 0.12, 1.62, 0.08)
      ant.rotation.z = side * 0.3
      group.add(ant)
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 8), accentMat)
      tip.position.set(side * 0.18, 1.8, 0.08)
      group.add(tip)
    }
  }

  if (def.kind === 'kite') {
    const sail = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.15, 4), accentMat)
    sail.position.set(0, 1.45, -0.45)
    sail.castShadow = true
    group.add(sail)
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), riderMat)
    stripe.position.set(0, 1.45, -0.45)
    group.add(stripe)
  }

  if (def.kind === 'owl') {
    head.scale.set(1.18, 1.05, 1.1)
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.28, 6), riderMat)
      ear.position.set(side * 0.18, 1.58, -0.02)
      ear.rotation.z = side * -0.2
      group.add(ear)
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 5), accentMat)
    beak.position.set(0, 1.16, 0.32)
    beak.rotation.x = Math.PI / 2
    group.add(beak)
  }

  if (def.kind === 'hare') {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.62, 0.08), accentMat)
      ear.position.set(side * 0.14, 1.78, 0)
      ear.rotation.z = side * 0.12
      group.add(ear)
    }
    const tail = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({
        color: def.accent,
        emissive: def.accent,
        emissiveIntensity: 0.7,
        roughness: 0.4
      })
    )
    tail.position.set(0, 0.78, -1.05)
    group.add(tail)
  }

  if (def.kind === 'pup') {
    head.scale.setScalar(1.12)
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.28, 0.08), accentMat)
      ear.position.set(side * 0.28, 1.18, 0)
      ear.rotation.z = side * 0.9
      group.add(ear)
    }
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), riderMat)
    snout.scale.set(1, 0.8, 1.2)
    snout.position.set(0, 1.12, 0.28)
    group.add(snout)
  }
}

function addEyes(group: THREE.Group, y: number, z: number, spread: number, ink: THREE.Material): void {
  const white = new THREE.MeshBasicMaterial({ color: '#fffaf3' })
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeWhiteGeo, white)
    eye.position.set(side * spread, y, z)
    const pupil = new THREE.Mesh(pupilGeo, ink)
    pupil.position.set(side * spread * 1.02, y, z + 0.06)
    group.add(eye, pupil)
  }
}

function standard(color: string, roughness: number, emissive = '#000000', emissiveIntensity = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06, emissive, emissiveIntensity })
}

function plateTexture(text: string, bg: string, ink: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 80
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 128, 80)
  ctx.strokeStyle = ink
  ctx.lineWidth = 6
  ctx.strokeRect(4, 4, 120, 72)
  ctx.fillStyle = ink
  ctx.font = '700 42px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 64, 42)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function labelTexture(text: string, hot: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 128
  const ctx = canvas.getContext('2d')!
  ctx.clearRect(0, 0, 512, 128)
  roundRect(ctx, 16, 24, 480, 80, 28)
  ctx.fillStyle = hot ? 'rgba(255,210,63,0.94)' : 'rgba(18,24,38,0.72)'
  ctx.fill()
  ctx.fillStyle = hot ? '#1b2437' : '#ffffff'
  ctx.font = '800 48px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 256, 66)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

export function shiftHex(hex: string, hue: number): string {
  const color = new THREE.Color(hex)
  color.offsetHSL(hue, 0, 0.04)
  return `#${color.getHexString()}`
}

export function buildField(selectedId: string): Array<{ def: RacerDef; isPlayer: boolean }> {
  const selected = RACERS.find((r) => r.id === selectedId) ?? RACERS[0]
  const others = RACERS.filter((r) => r.id !== selected.id)
  const field: Array<{ def: RacerDef; isPlayer: boolean }> = [{ def: selected, isPlayer: true }]
  for (const def of others) field.push({ def, isPlayer: false })
  others.slice(0, 2).forEach((def, index) => {
    field.push({
      def: {
        ...def,
        id: `${def.id}-jr`,
        name: `${def.name.split(' ')[0]} Jr.`,
        body: shiftHex(def.body, index === 0 ? 0.07 : -0.05),
        accent: shiftHex(def.accent, 0.04)
      },
      isPlayer: false
    })
  })
  return field
}
