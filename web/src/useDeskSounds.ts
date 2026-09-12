import {useEffect, useRef, useState} from "react";

/** Optional, locally synthesized paper/ink sounds; no audio assets or network requests. */
export function useDeskSounds() {
  const context = useRef<AudioContext | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    ++generation.current;
    void context.current?.close().catch(() => {});
    context.current = null;
  }, []);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const current = ++generation.current;
    try {
      if (context.current) {
        const previous = context.current;
        context.current = null;
        setEnabled(false);
        await previous.close();
      } else {
        const next = new AudioContext();
        context.current = next;
        await next.resume();
        if (current !== generation.current) return;
        if (next.state !== "running") throw new Error("Audio did not start");
        setEnabled(true);
      }
    } catch {
      const failed = context.current;
      context.current = null;
      void failed?.close().catch(() => {});
      if (current === generation.current) {
        setEnabled(false);
        setError("Desk sounds are unavailable in this browser. The investigation is still ready.");
      }
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(false);
      }
    }
  }

  function play(kind: "paper" | "stamp" = "paper") {
    const audio = context.current;
    if (!enabled || !audio || audio.state !== "running") return;
    const duration = kind === "stamp" ? 0.13 : 0.055;
    const buffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * duration), audio.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const gain = audio.createGain();
    source.buffer = buffer;
    filter.type = kind === "stamp" ? "lowpass" : "bandpass";
    filter.frequency.value = kind === "stamp" ? 260 : 1800;
    gain.gain.setValueAtTime(kind === "stamp" ? 0.11 : 0.035, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
    source.connect(filter).connect(gain).connect(audio.destination);
    source.onended = () => {source.disconnect(); filter.disconnect(); gain.disconnect();};
    source.start();
  }
  return {enabled, pending, error, toggle, play};
}
