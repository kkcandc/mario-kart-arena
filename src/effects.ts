import * as THREE from 'three'

const MAX = 380

export type Fx = {
  update: (dt: number) => void
  burst: (pos: THREE.Vector3, color: string, count: number, speed: number) => void
  trail: (pos: THREE.Vector3, color: string) => void
}

export function createFx(scene: THREE.Scene): Fx {
  const positions = new Float32Array(MAX * 3)
  const colors = new Float32Array(MAX * 3)
  const lives = new Float32Array(MAX)
  const vx = new Float32Array(MAX)
  const vy = new Float32Array(MAX)
  const vz = new Float32Array(MAX)
  const age = new Float32Array(MAX)
  const span = new Float32Array(MAX)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1))
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {},
    vertexShader: `
      attribute float aLife;
      attribute vec3 aColor;
      varying float vLife;
      varying vec3 vColor;
      void main() {
        vLife = aLife;
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(aLife * 52.0 * (90.0 / max(1.0, -mv.z)), 0.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      varying float vLife;
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        float alpha = smoothstep(0.5, 0.12, d) * vLife;
        gl_FragColor = vec4(vColor, alpha);
      }
    `
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false
  scene.add(points)

  for (let i = 0; i < MAX; i++) positions[i * 3 + 1] = -240
  let cursor = 0
  const tint = new THREE.Color()

  function spawn(x: number, y: number, z: number, color: string, speed: number, life: number, lift = 0): void {
    const i = cursor % MAX
    cursor += 1
    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
    tint.set(color)
    colors[i * 3] = tint.r
    colors[i * 3 + 1] = tint.g
    colors[i * 3 + 2] = tint.b
    vx[i] = (Math.random() - 0.5) * speed
    vy[i] = lift + Math.random() * speed
    vz[i] = (Math.random() - 0.5) * speed
    age[i] = 0
    span[i] = life
    lives[i] = 1
  }

  return {
    update(dt: number) {
      for (let i = 0; i < MAX; i++) {
        if (lives[i] <= 0) continue
        age[i] += dt
        const t = age[i] / span[i]
        if (t >= 1) {
          lives[i] = 0
          positions[i * 3 + 1] = -200
          continue
        }
        lives[i] = 1 - t
        positions[i * 3] += vx[i] * dt
        positions[i * 3 + 1] += vy[i] * dt
        positions[i * 3 + 2] += vz[i] * dt
        vy[i] -= 2.2 * dt
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.aLife.needsUpdate = true
      geo.attributes.aColor.needsUpdate = true
    },
    burst(pos, color, count, speed) {
      for (let n = 0; n < count; n++) spawn(pos.x, pos.y + 0.4, pos.z, color, speed, 0.45 + Math.random() * 0.35, speed * 0.35)
    },
    trail(pos, color) {
      spawn(pos.x, pos.y + 0.3, pos.z, color, 1.2, 0.38, 0.4)
    }
  }
}
