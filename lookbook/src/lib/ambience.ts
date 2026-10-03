// A small generative soundscape: a soft tanpura drone (Sa, Pa, Sa) with sparse bell-like
// notes from raga Bhupali, in a gentle reverb. Pure sine tones only, so there is no hiss.
// Synthesised with the Web Audio API: no audio file to download, and nothing loads until
// the visitor asks for sound.

type Ambience = { start: () => void; stop: () => void }

const SA = 130.81 // C3
// Bhupali: Sa Re Ga Pa Dha, two octaves up, for the bells.
const BELLS = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2].map((r) => SA * 4 * r)

/** A smooth stereo reverb tail: decaying, low-passed noise used only as an impulse. */
function reverbImpulse(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds)
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate)
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch)
    let smooth = 0
    for (let i = 0; i < length; i++) {
      smooth = smooth * 0.6 + (Math.random() * 2 - 1) * 0.4 // soften the highs
      data[i] = smooth * Math.pow(1 - i / length, 3)
    }
  }
  return impulse
}

export function createAmbience(): Ambience {
  const ctx = new AudioContext()
  const master = ctx.createGain()
  master.gain.value = 0
  const limiter = ctx.createDynamicsCompressor()
  limiter.threshold.value = -18
  limiter.ratio.value = 4
  master.connect(limiter).connect(ctx.destination)

  const reverb = ctx.createConvolver()
  reverb.buffer = reverbImpulse(ctx, 4)
  const wet = ctx.createGain()
  wet.gain.value = 0.45
  reverb.connect(wet).connect(master)

  const warm = ctx.createBiquadFilter()
  warm.type = "lowpass"
  warm.frequency.value = 2200
  warm.connect(master)
  warm.connect(reverb)

  // A held Sa + Pa underneath, breathing very slowly.
  const pad = ctx.createGain()
  pad.gain.value = 0.035
  const breath = ctx.createOscillator()
  breath.frequency.value = 0.05
  const breathDepth = ctx.createGain()
  breathDepth.gain.value = 0.015
  breath.connect(breathDepth).connect(pad.gain)
  pad.connect(warm)
  const padTones = [SA / 2, SA * 0.75, SA].map((freq, i) => {
    const osc = ctx.createOscillator()
    osc.type = "sine"
    osc.frequency.value = freq
    osc.detune.value = i * 2
    osc.connect(pad)
    return osc
  })

  // One note: a sine plus two quiet overtones, soft attack and a long decay.
  const note = (freq: number, at: number, level: number, decay: number) => {
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, at)
    gain.gain.linearRampToValueAtTime(level, at + 0.03)
    gain.gain.setTargetAtTime(0, at + 0.05, decay / 4)
    gain.connect(warm)
    const oscs = [
      [1, 1],
      [2, 0.18],
      [3, 0.06],
    ].map(([mult, amp]) => {
      const osc = ctx.createOscillator()
      osc.type = "sine"
      osc.frequency.value = freq * mult
      const g = ctx.createGain()
      g.gain.value = amp
      osc.connect(g).connect(gain)
      osc.start(at)
      osc.stop(at + decay + 0.5)
      return osc
    })
    oscs[0].onended = () => gain.disconnect()
  }

  // Tanpura cycle Pa, Sa', Sa', Sa, then now and then a bell.
  const cycle = 5.2
  const playCycle = (from: number) => {
    ;[SA * 1.5, SA * 2, SA * 2, SA].forEach((freq, i) => note(freq, from + (i * cycle) / 4, 0.07, 4.5))
    const bells = Math.random() < 0.35 ? 0 : Math.random() < 0.7 ? 1 : 2
    for (let b = 0; b < bells; b++) {
      const freq = BELLS[Math.floor(Math.random() * BELLS.length)]
      note(freq, from + 0.6 + Math.random() * (cycle - 1.2), 0.03, 3.5)
    }
  }

  let timer: number | undefined
  let started = false
  let suspendTimer: number | undefined
  return {
    start() {
      window.clearTimeout(suspendTimer)
      window.clearInterval(timer)
      void ctx.resume()
      if (!started) {
        breath.start()
        padTones.forEach((osc) => osc.start())
        started = true
      }
      let next = ctx.currentTime + 0.1
      playCycle(next)
      timer = window.setInterval(() => {
        next += cycle
        playCycle(next)
      }, cycle * 1000)
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0.7, ctx.currentTime, 1)
    },
    stop() {
      window.clearInterval(timer)
      master.gain.cancelScheduledValues(ctx.currentTime)
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
      suspendTimer = window.setTimeout(() => void ctx.suspend(), 1600)
    },
  }
}
