/* global globalThis */

const randomBytes = (length) => {
  const array = new Uint8Array(length);
  if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(array);
  } else if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return array;
};

export const generatePortalToken = (length = 48) => {
  const bytes = randomBytes(length);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const chars = [];
  for (let i = 0; i < length; i++) {
    chars.push(alphabet[bytes[i] % alphabet.length]);
  }
  return chars.join('');
};

export const generateOtpCode = () => {
  const num = Math.floor(Math.random() * 1000000);
  return String(num).padStart(6, '0');
};

const toHex = (buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');

export const hashSecret = async (value) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(String(value));
  if (typeof window !== 'undefined' && window.crypto?.subtle) {
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    return toHex(digest);
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
    return toHex(digest);
  }

  // Fallback: use a simple polyfill (not cryptographically secure)
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash |= 0;
  }
  return hash.toString(16);
};
