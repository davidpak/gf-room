/** Synthesized linear-actuator hum. Web Audio only, no asset. */
export class Hum {
  private ctx?: AudioContext
  private gain?: GainNode

  start() {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      const osc = this.ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 58
      const osc2 = this.ctx.createOscillator()
      osc2.type = 'triangle'
      osc2.frequency.value = 116.5
      const lp = this.ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 260
      this.gain = this.ctx.createGain()
      this.gain.gain.value = 0
      osc.connect(lp)
      osc2.connect(lp)
      lp.connect(this.gain)
      this.gain.connect(this.ctx.destination)
      osc.start()
      osc2.start()
    }
    void this.ctx.resume()
    const g = this.gain!.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.linearRampToValueAtTime(0.05, this.ctx.currentTime + 0.12)
  }

  stop() {
    if (!this.ctx || !this.gain) return
    const g = this.gain.gain
    g.cancelScheduledValues(this.ctx.currentTime)
    g.linearRampToValueAtTime(0, this.ctx.currentTime + 0.18)
  }
}
