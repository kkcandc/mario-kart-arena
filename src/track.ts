import * as THREE from 'three'

export const ROAD_HALF = 8
export const SAMPLE_COUNT = 420

export type TrackFrame = {
  point: THREE.Vector3
  tangent: THREE.Vector3
  right: THREE.Vector3
  normal: THREE.Vector3
  index: number
  along: number
  lateral: number
}

type Sample = {
  point: THREE.Vector3
  tangent: THREE.Vector3
  right: THREE.Vector3
  normal: THREE.Vector3
  distance: number
}

export type Track = {
  group: THREE.Group
  length: number
  minimap: Array<[number, number]>
  project: (pos: THREE.Vector3, hint: number) => TrackFrame
  frame: (distance: number) => TrackFrame
  pose: (distance: number, lateral: number, lift: number, target?: THREE.Vector3) => THREE.Vector3
}

const UP = new THREE.Vector3(0, 1, 0)

export function createTrack(): Track {
  const control = controlPoints()
  const curve = new THREE.CatmullRomCurve3(control, true, 'catmullrom', 0.35)
  const samples = buildSamples(curve)
  const length = loopLength(samples)
  const group = new THREE.Group()
  group.name = 'jellybean-ridge'
  group.add(buildRoad(samples))
  group.add(buildDashes(samples, length))
  group.add(buildGround())
  group.add(buildWater())
  group.add(buildSky())
  group.add(buildClouds())
  group.add(buildProps(samples, length))
  group.add(buildFinish(samples, length))

  const scratch: TrackFrame = {
    point: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    normal: new THREE.Vector3(),
    index: 0,
    along: 0,
    lateral: 0
  }
  const ab = new THREE.Vector3()
  const ap = new THREE.Vector3()
  const closest = new THREE.Vector3()

  function fillFrame(index: number, t: number, lateral = 0): TrackFrame {
    const n = samples.length
    const a = samples[index]
    const b = samples[(index + 1) % n]
    scratch.point.lerpVectors(a.point, b.point, t)
    scratch.tangent.copy(a.tangent).lerp(b.tangent, t).normalize()
    scratch.right.copy(a.right).lerp(b.right, t)
    scratch.right.addScaledVector(scratch.tangent, -scratch.right.dot(scratch.tangent)).normalize()
    scratch.normal.crossVectors(scratch.tangent, scratch.right).normalize()
    const seg =
      b.distance > a.distance ? (b.distance - a.distance) * t : (length - a.distance) * t
    scratch.along = a.distance + seg
    if (scratch.along >= length) scratch.along -= length
    scratch.index = index
    scratch.lateral = lateral
    return scratch
  }

  function project(pos: THREE.Vector3, hint: number): TrackFrame {
    const n = samples.length
    let best = ((hint % n) + n) % n
    let bestD = Infinity
    let bestT = 0
    const consider = (i: number) => {
      const a = samples[i].point
      const b = samples[(i + 1) % n].point
      ab.subVectors(b, a)
      const len2 = ab.lengthSq()
      let t = 0
      if (len2 > 1e-6) {
        t = ap.subVectors(pos, a).dot(ab) / len2
        t = THREE.MathUtils.clamp(t, 0, 1)
      }
      closest.copy(a).addScaledVector(ab, t)
      const d = closest.distanceToSquared(pos)
      if (d < bestD) {
        bestD = d
        best = i
        bestT = t
      }
    }
    for (let k = -28; k <= 28; k++) consider((hint + k + n) % n)
    if (bestD > 36 * 36) {
      for (let i = 0; i < n; i++) consider(i)
    }
    fillFrame(best, bestT, 0)
    ap.subVectors(pos, scratch.point)
    scratch.lateral = ap.dot(scratch.right)
    return scratch
  }

  function frame(distance: number): TrackFrame {
    const n = samples.length
    const d = ((distance % length) + length) % length
    if (d >= samples[n - 1].distance) {
      const span = Math.max(1e-4, length - samples[n - 1].distance)
      const t = THREE.MathUtils.clamp((d - samples[n - 1].distance) / span, 0, 1)
      return fillFrame(n - 1, t, 0)
    }
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (samples[mid].distance < d) lo = mid + 1
      else hi = mid
    }
    const index = Math.max(0, lo - 1)
    const a = samples[index]
    const b = samples[index + 1]
    const span = Math.max(1e-4, b.distance - a.distance)
    const t = THREE.MathUtils.clamp((d - a.distance) / span, 0, 1)
    return fillFrame(index, t, 0)
  }

  const poseTarget = new THREE.Vector3()
  function pose(distance: number, lateral: number, lift: number, target = poseTarget): THREE.Vector3 {
    const f = frame(distance)
    return target
      .copy(f.point)
      .addScaledVector(f.right, lateral)
      .addScaledVector(f.normal, lift)
  }

  return {
    group,
    length,
    minimap: samples.filter((_, i) => i % 3 === 0).map((s) => [s.point.x, s.point.z]),
    project,
    frame,
    pose
  }
}

function controlPoints(): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const count = 28
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2
    const radius = 88 + 22 * Math.sin(2 * t) + 6 * Math.sin(5 * t + 0.6)
    const x = Math.cos(t) * radius * 1.22
    const z = Math.sin(t) * radius * 0.84
    const y = 1.35 + 3.5 * (0.5 + 0.5 * Math.sin(2 * t))
    pts.push(new THREE.Vector3(x, y, z))
  }
  return pts
}

function buildSamples(curve: THREE.CatmullRomCurve3): Sample[] {
  const raw: Sample[] = []
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const u = i / SAMPLE_COUNT
    const point = curve.getPointAt(u)
    const tangent = curve.getTangentAt(u).normalize()
    const right = new THREE.Vector3().crossVectors(UP, tangent)
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
    right.normalize()
    const normal = new THREE.Vector3().crossVectors(tangent, right).normalize()
    raw.push({ point, tangent, right, normal, distance: 0 })
  }
  for (let i = 0; i < raw.length; i++) {
    const prev = raw[(i - 1 + raw.length) % raw.length].tangent
    const tangent = raw[i].tangent
    const crossY = prev.x * tangent.z - prev.z * tangent.x
    const bank = THREE.MathUtils.clamp(-crossY * 7.5, -0.42, 0.42)
    raw[i].right.applyAxisAngle(tangent, bank)
    raw[i].normal.applyAxisAngle(tangent, bank)
  }
  let distance = 0
  raw[0].distance = 0
  for (let i = 1; i < raw.length; i++) {
    distance += raw[i].point.distanceTo(raw[i - 1].point)
    raw[i].distance = distance
  }
  distance += raw[0].point.distanceTo(raw[raw.length - 1].point)
  Object.defineProperty(raw, 'loopLength', { value: distance })
  return raw
}

function loopLength(samples: Sample[]): number {
  return (samples as Sample[] & { loopLength?: number }).loopLength ?? 1
}

function buildRoad(samples: Sample[]): THREE.Mesh {
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const asphaltA = new THREE.Color('#3c4458')
  const asphaltB = new THREE.Color('#4c5670')
  const pink = new THREE.Color('#ff4d6d')
  const cream = new THREE.Color('#fff1c9')
  const skirt = new THREE.Color('#262c3b')
  const edge = new THREE.Color('#f7f4ea')

  const paint = (latA: number, liftA: number, latB: number, liftB: number, colorAt: (i: number) => THREE.Color) => {
    const base = positions.length / 3
    const n = samples.length
    for (let i = 0; i < n; i++) {
      const s = samples[i]
      const color = colorAt(i)
      for (const [lat, lift] of [
        [latA, liftA],
        [latB, liftB]
      ] as const) {
        positions.push(
          s.point.x + s.right.x * lat + s.normal.x * lift,
          s.point.y + s.right.y * lat + s.normal.y * lift,
          s.point.z + s.right.z * lat + s.normal.z * lift
        )
        colors.push(color.r, color.g, color.b)
      }
    }
    for (let i = 0; i < n; i++) {
      const i0 = base + i * 2
      const i1 = base + ((i + 1) % n) * 2
      indices.push(i0, i1, i0 + 1, i1, i1 + 1, i0 + 1)
    }
  }

  paint(-ROAD_HALF, 0.02, ROAD_HALF, 0.02, (i) => (Math.floor(i / 7) % 2 === 0 ? asphaltA : asphaltB))
  paint(-ROAD_HALF - 1.15, 0.24, -ROAD_HALF, 0.24, (i) => (Math.floor(i / 5) % 2 === 0 ? pink : cream))
  paint(ROAD_HALF, 0.24, ROAD_HALF + 1.15, 0.24, (i) => (Math.floor(i / 5) % 2 === 0 ? cream : pink))
  paint(-ROAD_HALF - 1.15, 0.24, -ROAD_HALF - 1.15, -1.05, () => skirt)
  paint(ROAD_HALF + 1.15, 0.24, ROAD_HALF + 1.15, -1.05, () => skirt)
  paint(-ROAD_HALF + 0.55, 0.05, -ROAD_HALF + 0.2, 0.05, () => edge)
  paint(ROAD_HALF - 0.2, 0.05, ROAD_HALF - 0.55, 0.05, () => edge)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      side: THREE.DoubleSide
    })
  )
  mesh.receiveShadow = true
  mesh.castShadow = false
  return mesh
}

function buildDashes(samples: Sample[], length: number): THREE.InstancedMesh {
  const geo = new THREE.BoxGeometry(0.28, 0.04, 1.7)
  const mat = new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.6 })
  const marks: number[] = []
  for (let d = 8; d < length - 8; d += 6.5) marks.push(d)
  const mesh = new THREE.InstancedMesh(geo, mat, marks.length)
  mesh.receiveShadow = true
  const matrix = new THREE.Matrix4()
  const basis = new THREE.Matrix4()
  const pos = new THREE.Vector3()
  marks.forEach((distance, index) => {
    const sample = sampleNear(samples, distance, length)
    pos.copy(sample.point).addScaledVector(sample.normal, 0.08)
    basis.makeBasis(sample.right, sample.normal, sample.tangent)
    matrix.copy(basis)
    matrix.setPosition(pos)
    mesh.setMatrixAt(index, matrix)
  })
  mesh.instanceMatrix.needsUpdate = true
  return mesh
}

function buildGround(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(250, 72)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const colors = new Float32Array(pos.count * 3)
  const grass = new THREE.Color('#37c36a')
  const grassDeep = new THREE.Color('#249553')
  const sand = new THREE.Color('#f3d7a1')
  const meadow = new THREE.Color('#7adf62')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const d = Math.hypot(x, z)
    const n = Math.sin(x * 0.045) * Math.cos(z * 0.04) + Math.sin((x + z) * 0.02)
    const color = d < 36 ? sand : n > 0.35 ? meadow : n < -0.25 ? grassDeep : grass
    colors[i * 3] = color.r
    colors[i * 3 + 1] = color.g
    colors[i * 3 + 2] = color.b
    if (d > 1) pos.setY(i, Math.sin(x * 0.03) * Math.cos(z * 0.028) * 0.45)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 })
  )
  mesh.receiveShadow = true
  mesh.position.y = -0.15
  return mesh
}

function buildWater(): THREE.Mesh {
  const geo = new THREE.CircleGeometry(20, 40)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.z += sin(p.x * 0.35 + uTime * 1.4) * 0.18;
          p.z += cos(p.y * 0.3 + uTime) * 0.12;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        void main() {
          float r = distance(vUv, vec2(0.5));
          vec3 deep = vec3(0.05, 0.45, 0.85);
          vec3 shallow = vec3(0.45, 0.9, 1.0);
          vec3 col = mix(shallow, deep, smoothstep(0.1, 0.5, r));
          gl_FragColor = vec4(col, 0.92);
        }
      `
    })
  )
  mesh.rotation.x = -Math.PI / 2
  mesh.position.y = 0.25
  mesh.name = 'lake'
  return mesh
}

export function tickWater(root: THREE.Object3D, time: number): void {
  root.traverse((obj) => {
    if (obj.name === 'lake' && obj instanceof THREE.Mesh) {
      const mat = obj.material as THREE.ShaderMaterial
      if (mat.uniforms?.uTime) mat.uniforms.uTime.value = time
    }
  })
}

function buildSky(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(420, 24, 16)
  const mesh = new THREE.Mesh(
    geo,
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vPos;
        void main() {
          float h = normalize(vPos).y * 0.5 + 0.5;
          vec3 top = vec3(0.33, 0.62, 1.0);
          vec3 mid = vec3(0.55, 0.84, 1.0);
          vec3 hor = vec3(1.0, 0.78, 0.52);
          vec3 col = mix(hor, mix(mid, top, smoothstep(0.15, 0.85, h)), smoothstep(0.0, 0.35, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `
    })
  )
  return mesh
}

function buildClouds(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'clouds'
  const mat = new THREE.MeshLambertMaterial({ color: '#fffdf8' })
  const puff = new THREE.SphereGeometry(1, 8, 6)
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Group()
    const blobs = 3 + (i % 3)
    for (let b = 0; b < blobs; b++) {
      const m = new THREE.Mesh(puff, mat)
      m.position.set(b * 1.5, Math.sin(b) * 0.3, (b % 2) * 0.4)
      m.scale.setScalar(1.4 + (b % 3) * 0.45)
      cloud.add(m)
    }
    const ang = (i / 14) * Math.PI * 2
    cloud.position.set(Math.cos(ang) * (150 + (i % 4) * 18), 38 + (i % 5) * 6, Math.sin(ang) * (120 + (i % 3) * 20))
    group.add(cloud)
  }
  return group
}

export function tickClouds(root: THREE.Object3D, dt: number): void {
  const clouds = root.getObjectByName('clouds')
  if (!clouds) return
  clouds.children.forEach((cloud, index) => {
    cloud.position.x += dt * (1.4 + (index % 3) * 0.4)
    if (cloud.position.x > 230) cloud.position.x = -230
  })
}

function buildProps(samples: Sample[], length: number): THREE.Group {
  const group = new THREE.Group()
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.3, 6)
  const leafGeo = new THREE.ConeGeometry(1.05, 2.3, 7)
  const rockGeo = new THREE.DodecahedronGeometry(0.7, 0)
  const gemGeo = new THREE.OctahedronGeometry(0.85, 0)
  const flowerGeo = new THREE.ConeGeometry(0.22, 0.45, 5)

  const trees: THREE.Matrix4[] = []
  const leaves: THREE.Matrix4[] = []
  const leafColors: THREE.Color[] = []
  const rocks: THREE.Matrix4[] = []
  const gems: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = []
  const flowers: Array<{ matrix: THREE.Matrix4; color: THREE.Color }> = []
  const leafPalette = ['#2f9e44', '#7cb518', '#40916c', '#52b788', '#90be6d'].map((h) => new THREE.Color(h))
  const gemPalette = ['#ff5d8f', '#ffd23f', '#4cc9f0', '#b5179e', '#80ffdb'].map((h) => new THREE.Color(h))
  const flowerPalette = ['#ff4d6d', '#ffd23f', '#ffffff', '#f72585', '#4cc9f0'].map((h) => new THREE.Color(h))

  const farEnough = (x: number, z: number, min: number) => {
    for (let i = 0; i < samples.length; i += 2) {
      const dx = samples[i].point.x - x
      const dz = samples[i].point.z - z
      if (dx * dx + dz * dz < min * min) return false
    }
    return true
  }

  let guard = 0
  while (trees.length < 90 && guard < 900) {
    guard++
    const ang = Math.random() * Math.PI * 2
    const rad = 28 + Math.random() * 150
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    if (!farEnough(x, z, 14)) continue
    const s = 0.8 + Math.random() * 1.1
    const matrix = new THREE.Matrix4()
    matrix.makeScale(s, s, s)
    matrix.setPosition(x, 0.5 * s, z)
    const leaf = new THREE.Matrix4()
    leaf.makeScale(s, s, s)
    leaf.setPosition(x, 1.7 * s, z)
    trees.push(matrix)
    leaves.push(leaf)
    leafColors.push(leafPalette[trees.length % leafPalette.length])
  }

  guard = 0
  while (rocks.length < 36 && guard < 400) {
    guard++
    const ang = Math.random() * Math.PI * 2
    const rad = 24 + Math.random() * 160
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    if (!farEnough(x, z, 12)) continue
    const s = 0.5 + Math.random() * 1.3
    const matrix = new THREE.Matrix4().makeScale(s, s * 0.7, s)
    matrix.setPosition(x, 0.2, z)
    rocks.push(matrix)
  }

  guard = 0
  while (gems.length < 28 && guard < 300) {
    guard++
    const ang = Math.random() * Math.PI * 2
    const rad = 30 + Math.random() * 90
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    if (!farEnough(x, z, 13)) continue
    const s = 0.6 + Math.random() * 1.2
    const matrix = new THREE.Matrix4().makeScale(s, s * 1.4, s)
    matrix.setPosition(x, 1.2 + Math.random(), z)
    gems.push({ matrix, color: gemPalette[gems.length % gemPalette.length] })
  }

  guard = 0
  while (flowers.length < 70 && guard < 500) {
    guard++
    const ang = Math.random() * Math.PI * 2
    const rad = 22 + Math.random() * 120
    const x = Math.cos(ang) * rad
    const z = Math.sin(ang) * rad
    if (!farEnough(x, z, 11)) continue
    const matrix = new THREE.Matrix4()
    matrix.makeRotationY(Math.random() * 3)
    matrix.setPosition(x, 0.2, z)
    flowers.push({ matrix, color: flowerPalette[flowers.length % flowerPalette.length] })
  }

  group.add(instanced(trunkGeo, '#8d5a3b', trees))
  group.add(instancedColored(leafGeo, leaves, leafColors))
  group.add(instanced(rockGeo, '#adb5bd', rocks))
  const gemMesh = instancedColored(
    gemGeo,
    gems.map((g) => g.matrix),
    gems.map((g) => g.color)
  )
  gemMesh.name = 'gems'
  group.add(gemMesh)
  group.add(
    instancedColored(
      flowerGeo,
      flowers.map((f) => f.matrix),
      flowers.map((f) => f.color)
    )
  )

  group.add(buildArches(samples, length))
  group.add(buildGrandstand(samples))
  return group
}

export function tickGems(root: THREE.Object3D, time: number): void {
  const gems = root.getObjectByName('gems')
  if (gems) gems.rotation.y = time * 0.15
}

function buildArches(samples: Sample[], length: number): THREE.Group {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({
    color: '#ff8fab',
    roughness: 0.45,
    emissive: '#ff4d6d',
    emissiveIntensity: 0.08
  })
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2d42', roughness: 0.8, side: THREE.DoubleSide })
  const fractions = [0.18, 0.46, 0.72]
  for (const fraction of fractions) {
    const tunnel = Math.abs(fraction - 0.46) < 0.01
    const steps = tunnel ? 7 : 1
    for (let s = 0; s < steps; s++) {
      const distance = (fraction + s * 0.012) * length
      const sample = sampleNear(samples, distance, length)
      const arch = new THREE.Group()
      const span = ROAD_HALF * 2 + 3.2
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.45, 0.7), mat)
      beam.position.y = 4.3
      beam.castShadow = true
      arch.add(beam)
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 4.3, 0.7), mat)
        post.position.set(side * (span / 2 - 0.2), 2.15, 0)
        post.castShadow = true
        arch.add(post)
      }
      if (tunnel) {
        const roof = new THREE.Mesh(new THREE.BoxGeometry(span, 0.2, 7), dark)
        roof.position.y = 4.6
        arch.add(roof)
      }
      placeOnSample(arch, sample, 0, 0)
      group.add(arch)
    }
  }
  return group
}

function buildGrandstand(samples: Sample[]): THREE.Group {
  const group = new THREE.Group()
  const sample = samples[6]
  const seatColors = ['#ff4d6d', '#ffd23f', '#4cc9f0', '#b5179e', '#80ffdb', '#ff9f1c']
  for (let row = 0; row < 4; row++) {
    for (let seat = 0; seat < 9; seat++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.7 + row * 0.15, 0.9),
        new THREE.MeshStandardMaterial({ color: seatColors[(row + seat) % seatColors.length], roughness: 0.6 })
      )
      box.position.set((seat - 4) * 1.05, 0.4 + row * 0.55, 0)
      box.castShadow = true
      box.receiveShadow = true
      group.add(box)
    }
  }
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 1.4),
    new THREE.MeshBasicMaterial({ map: signTexture('RIDGE CREW', '#1b2437', '#fff4d6'), side: THREE.DoubleSide })
  )
  banner.position.set(0, 3.4, 0.2)
  group.add(banner)
  placeOnSample(group, sample, ROAD_HALF + 8.5, 0)
  return group
}

function buildFinish(samples: Sample[], length: number): THREE.Group {
  const group = new THREE.Group()
  const sample = sampleNear(samples, 0.5, length)
  for (let i = 0; i < 10; i++) {
    const lat = -ROAD_HALF + 0.8 + i * ((ROAD_HALF * 2 - 1.6) / 10)
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.05, 1.5),
      new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? '#16181f' : '#f8f6f2', roughness: 0.7 })
    )
    const pos = sample.point.clone().addScaledVector(sample.right, lat).addScaledVector(sample.normal, 0.1)
    tile.position.copy(pos)
    const basis = new THREE.Matrix4().makeBasis(sample.right, sample.normal, sample.tangent)
    tile.quaternion.setFromRotationMatrix(basis)
    tile.receiveShadow = true
    group.add(tile)
  }

  const span = ROAD_HALF * 2 + 2
  const banner = new THREE.Group()
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(span, 2.1),
    new THREE.MeshBasicMaterial({
      map: signTexture('NOVA DASH', '#ff4d6d', '#fff8ea'),
      side: THREE.DoubleSide
    })
  )
  cloth.position.y = 5.1
  banner.add(cloth)
  const poleMat = new THREE.MeshStandardMaterial({ color: '#fff1c9', roughness: 0.45 })
  for (const side of [-1, 1]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 5.4, 8), poleMat)
    pole.position.set(side * (span / 2), 2.7, 0)
    pole.castShadow = true
    banner.add(pole)
  }
  placeOnSample(banner, sample, 0, 0)
  group.add(banner)
  return group
}

function signTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 256
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 1024, 256)
  ctx.fillStyle = fg
  ctx.font = '800 132px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 512, 128)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

function instanced(geo: THREE.BufferGeometry, color: string, matrices: THREE.Matrix4[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.75 }),
    Math.max(1, matrices.length)
  )
  matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix))
  mesh.instanceMatrix.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = true
  if (matrices.length === 0) mesh.count = 0
  return mesh
}

function instancedColored(geo: THREE.BufferGeometry, matrices: THREE.Matrix4[], colors: THREE.Color[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    geo,
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.55 }),
    Math.max(1, matrices.length)
  )
  matrices.forEach((matrix, index) => {
    mesh.setMatrixAt(index, matrix)
    mesh.setColorAt(index, colors[index])
  })
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.castShadow = false
  mesh.receiveShadow = true
  if (matrices.length === 0) mesh.count = 0
  return mesh
}

function sampleNear(samples: Sample[], distance: number, length: number): Sample {
  const d = ((distance % length) + length) % length
  let best = samples[0]
  let bestDelta = Infinity
  for (const sample of samples) {
    let delta = Math.abs(sample.distance - d)
    delta = Math.min(delta, length - delta)
    if (delta < bestDelta) {
      bestDelta = delta
      best = sample
    }
  }
  return best
}

function placeOnSample(obj: THREE.Object3D, sample: Sample, lateral: number, lift: number): void {
  obj.position
    .copy(sample.point)
    .addScaledVector(sample.right, lateral)
    .addScaledVector(sample.normal, lift)
  const basis = new THREE.Matrix4().makeBasis(sample.right, sample.normal, sample.tangent)
  obj.quaternion.setFromRotationMatrix(basis)
}

export function createLights(): { sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; fill: THREE.DirectionalLight } {
  const hemi = new THREE.HemisphereLight('#d7ecff', '#3cbf6e', 0.95)
  const sun = new THREE.DirectionalLight('#fff4dd', 1.45)
  sun.position.set(40, 90, 30)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.near = 8
  sun.shadow.camera.far = 160
  sun.shadow.camera.left = -55
  sun.shadow.camera.right = 55
  sun.shadow.camera.top = 55
  sun.shadow.camera.bottom = -55
  sun.shadow.bias = -0.0004
  const fill = new THREE.DirectionalLight('#ffb3c6', 0.45)
  fill.position.set(-30, 40, -20)
  return { sun, hemi, fill }
}
