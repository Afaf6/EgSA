const HEX_BYTE = /(?<![A-Fa-f0-9])[A-Fa-f0-9]{2}(?![A-Fa-f0-9])/g;

function parseHexBytes(value) {
  return (String(value || "").match(HEX_BYTE) || []).map((byte) => Number.parseInt(byte, 16));
}

function extractMessages(text) {
  const messages = [];
  let timestamp = "";

  for (const line of String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const timestampMatch = line.match(/\[([^\]]+)\]/);
    if (timestampMatch) timestamp = timestampMatch[1];

    const content = line.replace(/\[[^\]]+\]/g, "");
    const marker = content.match(/\b(?:msg|message|data|packet|payload|rx|tx)\b\s*[:=]\s*(.*)$/i);
    const payload = marker ? marker[1] : content;
    const bytes = parseHexBytes(payload);
    const isByteLine = bytes.length >= 4 && payload.replace(HEX_BYTE, "").replace(/[\s,:;|_-]/g, "") === "";
    const isMessageLine = marker !== null;
    if (bytes.length < 4 || (!isMessageLine && !isByteLine)) continue;

    messages.push({ timestamp, bytes });
  }

  return messages;
}

function frameHeaderBytes(frame) {
  return parseHexBytes(frame.header?.headerPattern || frame.headerPattern || "");
}

function matchFrame(bytes, frames) {
  const headerMatches = frames
    .map((frame) => ({ frame, header: frameHeaderBytes(frame) }))
    .filter(({ header }) => header.length > 0 && header.every((byte, index) => bytes[index] === byte))
    .sort((left, right) => right.header.length - left.header.length);

  if (headerMatches.length) return headerMatches[0].frame;
  return frames.find((frame) => Number(frame.frameLength) > 0 && Number(frame.frameLength) === bytes.length) || null;
}

function decodeValue(bytes, parameter, payloadBaseOffset = 0) {
  const base = Number(payloadBaseOffset) || 0;
  const start = base + (Number(parameter.byteOffset) || 0);
  const length = Number(parameter.length) || 1;
  const chunk = bytes.slice(start, start + length);
  if (chunk.length !== length) return null;

  let raw;
  const type = String(parameter.dataType || "").toLowerCase();
  const isBE = String(parameter.endianness || "").toUpperCase() === "BE" || type.endsWith("_be");

  if ((type.includes("float32") || type === "float") && chunk.length === 4) {
    const ordered = isBE ? chunk : [...chunk].reverse();
    const view = new DataView(new Uint8Array(ordered).buffer);
    raw = view.getFloat32(0, false);
  } else if ((type.includes("float64") || type === "double") && chunk.length === 8) {
    const ordered = isBE ? chunk : [...chunk].reverse();
    const view = new DataView(new Uint8Array(ordered).buffer);
    raw = view.getFloat64(0, false);
  } else {
    const ordered = isBE ? chunk : [...chunk].reverse();
    let integer = ordered.reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
    const bitOffset = BigInt(Number(parameter.bitOffset) || 0);
    const hasBitLength = typeof parameter.bitLength === "number" && parameter.bitLength >= 1;
    const bitLength = hasBitLength ? BigInt(parameter.bitLength) : BigInt(chunk.length * 8) - bitOffset;

    if (hasBitLength) {
      const mask = (1n << bitLength) - 1n;
      integer = (integer >> bitOffset) & mask;
    } else {
      integer >>= bitOffset;
    }

    const signed = parameter.signed === "signed" || parameter.signed === true || type.startsWith("int");
    if (signed && bitLength > 0n && (integer & (1n << (bitLength - 1n)))) {
      integer -= 1n << bitLength;
    }
    raw = Number(integer);
  }

  const scale = parameter.scale === "" || parameter.scale === undefined ? 1 : Number(parameter.scale);
  const offset = parameter.offset === "" || parameter.offset === undefined ? 0 : Number(parameter.offset);
  return raw * (Number.isFinite(scale) ? scale : 1) + (Number.isFinite(offset) ? offset : 0);
}

/** Parse raw telemetry logs using only the frames supplied for the current project. */
export function parseTelemetryLog(text, frames = [], projectId = "") {
  const messages = extractMessages(text).map(({ timestamp, bytes }, index) => {
    const frame = matchFrame(bytes, frames);
    const baseOffset = frame?.payloadBaseOffset ?? frame?.header?.payloadBaseOffset ?? 0;
    const values = {};
    frame?.parameters?.forEach((parameter) => {
      if (parameter.name) values[parameter.name] = decodeValue(bytes, parameter, baseOffset);
    });

    return {
      id: `${projectId || "project"}_message_${index + 1}`,
      projectId,
      timestamp,
      bytes,
      frameId: frame?.id || null,
      frameName: frame?.name || "Unknown / Unmatched Frame",
      subsystem: frame?.subsystem || "Unknown",
      matched: Boolean(frame),
      values,
    };
  });

  const frameCounts = messages.reduce((counts, message) => {
    if (message.matched) {
      const key = `${message.subsystem} / ${message.frameName}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, {});

  return {
    totalMessages: messages.length,
    matchedCount: messages.filter((message) => message.matched).length,
    unmatchedCount: messages.filter((message) => !message.matched).length,
    frameCounts,
    messages,
  };
}