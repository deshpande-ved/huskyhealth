// web/js/voice.js: record one spoken question (at most 5 s) and encode it as 24 kHz 16-bit mono WAV. No network here.
export const RATE = 24000;
export const MAX_MS = 5000;

export function encodeWav(samples, rate = RATE) {            // Float32 [-1, 1] -> WAV bytes
  const pcm = new DataView(new ArrayBuffer(44 + samples.length * 2));
  const str = (o, s) => [...s].forEach((ch, i) => pcm.setUint8(o + i, ch.charCodeAt(0)));
  str(0, "RIFF"); pcm.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVEfmt ");
  pcm.setUint32(16, 16, true); pcm.setUint16(20, 1, true); pcm.setUint16(22, 1, true);
  pcm.setUint32(24, rate, true); pcm.setUint32(28, rate * 2, true); pcm.setUint16(32, 2, true); pcm.setUint16(34, 16, true);
  str(36, "data"); pcm.setUint32(40, samples.length * 2, true);
  samples.forEach((v, i) => pcm.setInt16(44 + i * 2, Math.max(-1, Math.min(1, v)) * 0x7fff, true));
  return new Uint8Array(pcm.buffer);
}

// Start recording; resolves to { stop } that ends early. `done` gets the WAV bytes (or null if nothing was heard).
export async function recordQuestion(done, maxMs = MAX_MS) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());              // the microphone is released at once
    try {
      const buf = await new Blob(chunks).arrayBuffer();
      const decoded = await new AudioContext().decodeAudioData(buf);
      const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
      const src = off.createBufferSource(); src.buffer = decoded; src.connect(off.destination); src.start();
      const out = await off.startRendering();
      done(encodeWav(out.getChannelData(0).slice(0, RATE * (maxMs / 1000))));
    } catch {
      done(null);
    }
  };
  rec.start();
  const timer = setTimeout(() => rec.state === "recording" && rec.stop(), maxMs);
  return { stop: () => { clearTimeout(timer); if (rec.state === "recording") rec.stop(); } };
}
