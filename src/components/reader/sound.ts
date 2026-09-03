/**
 * Page-turn sound (requirement 8's last bullet). Default OFF, persisted
 * toggle, and — because browsers block audio playback before the visitor
 * has interacted with the page at all — the AudioContext is only ever
 * created lazily, inside a real user-gesture handler.
 *
 * No sound *asset* ships with this module. A short paper-riffle noise is
 * synthesised on the fly with the Web Audio API (filtered noise burst with
 * a fast attack/decay envelope) instead of shipping a binary file: this
 * reader module owns no place to put one (audio assets aren't part of the
 * PageSource/derived-assets pipeline, which is scoped to page images), and
 * fetching one from an external host would mean depending on a URL this
 * module doesn't control. Synthesis keeps the whole feature self-contained
 * in code.
 */

import { getSoundEnabled, setSoundEnabled } from "./progress";
import { ICON_SOUND_OFF, ICON_SOUND_ON } from "./icons";

const DURATION_SECONDS = 0.22;

export class SoundController {
  readonly toggleButton: HTMLButtonElement;

  private enabled: boolean;
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  constructor() {
    this.enabled = getSoundEnabled();

    this.toggleButton = document.createElement("button");
    this.toggleButton.type = "button";
    this.toggleButton.className = "reader-sound-toggle";
    this.toggleButton.addEventListener("click", () => this.toggle());
    this.reflectState();
  }

  private reflectState(): void {
    this.toggleButton.setAttribute("aria-pressed", String(this.enabled));
    const icon = this.enabled ? ICON_SOUND_ON : ICON_SOUND_OFF;
    const label = this.enabled ? "Sound on" : "Sound off";
    this.toggleButton.innerHTML = `${icon}<span>${label}</span>`;
  }

  toggle(): void {
    this.enabled = !this.enabled;
    setSoundEnabled(this.enabled);
    this.reflectState();
  }

  /**
   * Wires a one-time listener that creates (or resumes) the AudioContext
   * on the visitor's first interaction anywhere in the reader. Safe to
   * call every mount — does nothing once already unlocked.
   */
  unlockOnFirstGesture(target: HTMLElement): void {
    if (this.ctx) return;
    const unlock = (): void => {
      target.removeEventListener("pointerdown", unlock);
      target.removeEventListener("keydown", unlock);
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return; // Web Audio unavailable — playTurn() below just stays a no-op
      this.ctx = new Ctor();
      if (this.ctx.state === "suspended") void this.ctx.resume();
    };
    target.addEventListener("pointerdown", unlock);
    target.addEventListener("keydown", unlock);
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const length = Math.ceil(ctx.sampleRate * DURATION_SECONDS);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  /** No-ops silently whenever sound is off, or the context hasn't been unlocked by a gesture yet — never throws, never surfaces a "couldn't play audio" error to the visitor. */
  playTurn(): void {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const source = ctx.createBufferSource();
    source.buffer = this.getNoiseBuffer(ctx);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(2200, now);
    bandpass.frequency.exponentialRampToValueAtTime(900, now + DURATION_SECONDS);
    bandpass.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.35, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + DURATION_SECONDS);

    source.connect(bandpass);
    bandpass.connect(gain);
    gain.connect(ctx.destination);

    source.start(now);
    source.stop(now + DURATION_SECONDS);
  }
}
