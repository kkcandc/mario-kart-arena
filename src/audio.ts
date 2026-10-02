export type AudioBus = {
  resume: () => void
  setMuted: (muted: boolean) => void
  muted: () => boolean
  update: (dt: number, speed: number, boosting: boolean, engineOn: boolean) => void
  beep: (freq: number, dur?: number) => void
  item: () => void
  hit: () => void
  boost: () => void
  fanfare: () => void
}

export function createAudio(): AudioBus {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let engine: OscillatorNode | null = null
  let engineGain: GainNode | null = null
  let filter: BiquadFilterNode | null = null
  let musicTime = 0
  let step = 0
  let isMuted = false

  const tune = [523.25, 659.25, 783.99, 659.25, 587.33, 783.99, 880, 698.46]

  function ensure(): AudioContext | null {
    if (ctx) return ctx
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = isMuted ? 0 : 0.22
    master.connect(ctx.destination)

    engine = ctx.createOscillator()
    engine.type = 'sawtooth'
    filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    engineGain = ctx.createGain()
    engineGain.gain.value = 0.0001
    engine.connect(filter)
    filter.connect(engineGain)
    engineGain.connect(master)
    engine.start()
    return ctx
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    delay = 0
  ): void {
    const ac = ensure()
    if (!ac || !master || isMuted) return
    const t0 = ac.currentTime + delay
    const osc = ac.createOscillator()
    const gain = ac.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    gain.gain.setValueAtTime(vol, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  function noise(dur: number, vol: number, freq = 300): void {
    const ac = ensure()
    if (!ac || !master || isMuted) return
    const frames = Math.max(1, Math.floor(ac.sampleRate * dur))
    const buffer = ac.createBuffer(1, frames, ac.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    const src = ac.createBufferSource()
    src.buffer = buffer
    const filterNode = ac.createBiquadFilter()
    filterNode.type = 'bandpass'
    filterNode.frequency.value = freq
    const gain = ac.createGain()
    gain.gain.value = vol
    src.connect(filterNode)
    filterNode.connect(gain)
    gain.connect(master)
    src.start()
  }

  return {
    resume() {
      const ac = ensure()
      if (ac && ac.state !== 'running') void ac.resume()
    },
    setMuted(muted: boolean) {
      isMuted = muted
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.22, ctx.currentTime, 0.03)
    },
    muted: () => isMuted,
    update(dt, speed, boosting, engineOn) {
      const ac = ctx
      if (!ac || !engine || !engineGain || !filter || isMuted) {
        musicTime += dt
        return
      }
      const targetFreq = 58 + speed * 3.4 + (boosting ? 36 : 0)
      engine.frequency.setTargetAtTime(targetFreq, ac.currentTime, 0.08)
      filter.frequency.setTargetAtTime(520 + speed * 28 + (boosting ? 400 : 0), ac.currentTime, 0.08)
      engineGain.gain.setTargetAtTime(engineOn ? 0.04 : 0.0001, ac.currentTime, 0.08)

      musicTime += dt
      if (engineOn && musicTime > 0.28) {
        musicTime = 0
        const note = tune[step % tune.length]
        tone(note, 0.22, 'triangle', boosting ? 0.05 : 0.028)
        step += 1
      }
    },
    beep(freq, dur = 0.12) {
      tone(freq, dur, 'square', 0.06)
    },
    item() {
      tone(880, 0.08, 'square', 0.05)
      tone(1320, 0.14, 'square', 0.04, 0.07)
    },
    hit() {
      noise(0.18, 0.2, 180)
      tone(140, 0.2, 'sawtooth', 0.05)
    },
    boost() {
      noise(0.12, 0.08, 900)
      tone(520, 0.16, 'square', 0.04)
    },
    fanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((n, i) => tone(n, 0.28, 'triangle', 0.07, i * 0.14))
    }
  }
}
