// Spoken questions are encoded as 24 kHz 16-bit mono WAV before they go to the relay (which checks RIFF/WAVE).
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeWav, RATE, MAX_MS } from "../web/js/voice.js";

test("encodeWav: valid header, sizes, clipping; 5 s at 24 kHz fits the relay's 250 kB cap", () => {
  const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 2, -2]));
  const dv = new DataView(wav.buffer);
  const tag = (o) => String.fromCharCode(...wav.slice(o, o + 4));
  assert.equal(tag(0), "RIFF"); assert.equal(tag(8), "WAVE"); assert.equal(tag(36), "data");
  assert.equal(dv.getUint32(24, true), RATE); assert.equal(dv.getUint16(22, true), 1); assert.equal(dv.getUint16(34, true), 16);
  assert.equal(dv.getUint32(40, true), 10); assert.equal(wav.length, 54);
  assert.deepEqual([1, 2, 3, 4].map((i) => dv.getInt16(44 + i * 2, true)), [16383, -16383, 32767, -32767]);
  assert.ok(44 + RATE * (MAX_MS / 1000) * 2 <= 250_000);
});
