// A small generative soundscape: soft rain over a tanpura-like drone (Sa, Pa, Sa).
// Synthesised with the Web Audio API, so there is no audio file to download and
// nothing loads until the visitor asks for sound.

type Ambience = { start: () => void; stop: () => void }

const SA = 130.81 // C3

export function createAmbience(): Ambience {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  master.connect(ctx.destination)

  // Rain: looping noise, band-limited, with a slow swell.
  const seconds = 4
  const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let brown = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    brown = (brown + 0.02 * white) / 1.02
    // mostly pink-ish hiss with occasional droplets
    data[i] = white * 0.35 + brown * 3 + (Math.random() < 0.0004 ? (Math.random() - 0.5) * 1.6 : 0)
  }
  const rain = ctx.createBufferSource()
  rain.buffer = buffer
  rain.loop = true
  const rainFilter = ctx.createBiquadFilter()
  rainFilter.type = "bandpass"
  rainFilter.frequency.value = 1400
  rainFilter.Q.value = 0.5
  const rainGain = ctx.createGain()
  rainGain.gain.value = 0.22
  const swell = ctx.createOscillator()
  swell.frequency.value = 0.07
  const swellDepth = ctx.createGain()
  swellDepth.gain.value = 0.08
  swell.connect(swellDepth).connect(rainGain.gain)
  rain.connect(rainFilter).connect(rainGain).connect(master)

  // Drone: four strings plucked in the tanpura cycle Pa, Sa', Sa', Sa.
  const droneFilter = ctx.createBiquadFilter()
  droneFilter.type = "lowpass"
  droneFilter.frequency.value = 1100
  droneFilter.connect(master)
  const strings = [SA * 1.5, SA * 2, SA * 2, SA].map((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = "sawtooth"
    osc.frequency.value = freq
    osc.detune.value = (i - 1.5) * 3
    const gain = ctx.createGain()
    gain.gain.value = 0
    osc.connect(gain).connect(droneFilter)
    return { osc, gain }
  })

  let timer: number | undefined
  const cycle = 4.8
  const pluck = (from: number) => {
    strings.forEach(({ gain }, i) => {
      const t = from + (i * cycle) / 4
      gain.gain.cancelScheduledValues(t)
      gain.gain.setTargetAtTime(0.028, t, 0.02)
      gain.gain.setTargetAtTime(0.006, t + 0.15, 1.6)
    })
  }

  let started = false
  let suspendTimer: number | undefined
  return {
    start() {
      window.clearTimeout(suspendTimer)
      window.clearInterval(timer)
      void ctx.resume()
      if (!started) {
        rain.start()
        swell.start()
        strings.forEach(({ osc }) => osc.start())
        started = true
      }
      let next = ctx.currentTime + 0.1
      pluck(next)
      timer = window.setInterval(() => {
        next += cycle
        pluck(next)
      }, cycle * 1000)
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8)
    },
    stop() {
      window.clearInterval(timer)
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
      suspendTimer = window.setTimeout(() => void ctx.suspend(), 1600)
    },
  }
}
