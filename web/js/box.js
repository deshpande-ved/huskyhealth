// web/js/box.js: convenience mode keys are made and used only on the phone. No network here.
const b64 = (u8) => btoa(String.fromCharCode(...u8));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function makeKeys() {
  const pair = await crypto.subtle.generateKey(
    { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    false, ["encrypt", "decrypt"]);                         // private key can't be exported
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey));
  return { pair, publicKeyB64: b64(spki) };
}

// Undo the relay's seal(): RSA-OAEP(SHA-256) unwraps the AES-256-GCM key, which opens the payload.
export async function openDrop(privateKey, { key, nonce, ct }) {
  const raw = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, unb64(key));
  const aes = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(nonce) }, aes, unb64(ct));
  return JSON.parse(new TextDecoder().decode(plain));
}
