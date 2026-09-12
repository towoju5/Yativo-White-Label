let audioCtx: AudioContext | null = null;

/**
 * A short two-tone beep, synthesized with the Web Audio API rather than a bundled audio file —
 * one less asset to ship/theme, and it's a genuinely tiny amount of code. Silently no-ops if the
 * browser blocks audio before any user gesture has happened on the page (autoplay policy) or
 * doesn't support the API at all — a missed beep is not worth surfacing an error for.
 */
export function playChatBeep(): void {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();

    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    gain.connect(audioCtx.destination);

    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(1175, now + 0.09);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Autoplay-policy or unsupported-browser failures are fine to ignore — see doc comment.
  }
}
