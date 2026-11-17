/**
 * client/src/utils/crcPresets.js
 *
 * Shared CRC preset matching and display helpers reused across
 * CrcConfigSection and FrameInspector.
 */

/**
 * Normalizes input value (string with or without 0x, or number) to uppercase hex string without 0x prefix for display.
 */
export function toDisplayHex(val, width = 16) {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'number') {
    if (isNaN(val)) return '';
    const hex = (val >>> 0).toString(16).toUpperCase();
    const hexDigits = Math.max(2, Math.ceil(width / 4));
    return hex.padStart(hexDigits, '0');
  }
  const s = String(val).trim();
  if (!s) return '';
  const clean = s.replace(/^0x/i, '').toUpperCase();
  const hexDigits = Math.max(2, Math.ceil(width / 4));
  return clean.padStart(hexDigits, '0');
}

/**
 * Parses hex string (with or without 0x) or safe number to BigInt.
 */
export function parseHexToBigInt(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (isNaN(val) || val < 0) return null;
    return BigInt(val >>> 0);
  }
  const s = String(val).trim();
  if (!/^(0x)?[0-9a-f]+$/i.test(s)) return null;
  const clean = s.replace(/^0x/i, '');
  try {
    return BigInt('0x' + clean);
  } catch {
    return null;
  }
}

/**
 * Matches CRC parameters against presets table (reused by CrcConfigSection and FrameInspector).
 */
export function findMatchingPreset(crc, presets = []) {
  if (!presets || presets.length === 0 || !crc) return null;
  const w = Number(crc.width) || 16;
  const pBig = parseHexToBigInt(crc.polynomial);
  const iBig = parseHexToBigInt(crc.init !== undefined ? crc.init : crc.initValue);
  const xBig = parseHexToBigInt(crc.xorOut);

  if (pBig === null || iBig === null || xBig === null) {
    return null;
  }

  const xi = Boolean(crc.refIn);
  const xo = Boolean(crc.refOut);

  return (
    presets.find((pr) => {
      if (Number(pr.width) !== w) return false;
      if (Boolean(pr.refIn) !== xi || Boolean(pr.refOut) !== xo) return false;
      const prP = parseHexToBigInt(pr.polynomial);
      const prI = parseHexToBigInt(pr.init !== undefined ? pr.init : pr.initValue);
      const prX = parseHexToBigInt(pr.xorOut);
      return prP === pBig && prI === iBig && prX === xBig;
    }) || null
  );
}

/**
 * Formats a descriptive CRC label from parameters when no preset matches. Never outputs "CUSTOM".
 */
export function formatDescriptiveCrcLabel(crc) {
  const w = Number(crc?.width) || 16;
  const pBig = parseHexToBigInt(crc?.polynomial);
  if (pBig !== null && pBig !== 0n) {
    let hexStr = '';
    if (typeof crc?.polynomial === 'string' && /^(0x)?[0-9a-f]+$/i.test(crc.polynomial.trim())) {
      hexStr = crc.polynomial.trim().replace(/^0x/i, '');
    } else {
      hexStr = pBig.toString(16);
    }
    return `CRC-${w} (poly 0x${hexStr})`;
  }
  return `CRC-${w}`;
}

/**
 * Resolves the user-facing display name for a frame's CRC configuration.
 */
export function resolveCrcDisplayName(crc, presets = []) {
  if (!crc) return 'CRC';
  const matched = findMatchingPreset(crc, presets);
  if (matched) return matched.name;
  return formatDescriptiveCrcLabel(crc);
}
