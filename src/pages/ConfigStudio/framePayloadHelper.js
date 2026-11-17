/**
 * Helper to build sanitized frame update payload for Config Studio.
 * Enforces rule: Send ONLY the CRC fields the user actually changed.
 * Never send null, undefined, or empty values, and never "0x0" default.
 */
export function buildClientFramePatchBody({ frameDraft, selectedFrame, isCrcChanged = false }) {
  const data = {
    name: frameDraft?.name || selectedFrame?.name,
    ...(Number(frameDraft?.frameLength) ? { totalFrameLength: Number(frameDraft.frameLength) } : {}),
    ...(frameDraft?.searchHeader !== undefined ? { searchHeader: frameDraft.searchHeader.trim() } : {}),
    ...(frameDraft?.protocol !== undefined ? { protocol: frameDraft.protocol.trim() } : {}),
    ...(frameDraft?.dataRepresentation !== undefined ? { dataRepresentation: frameDraft.dataRepresentation } : (selectedFrame?.dataRepresentation ? { dataRepresentation: selectedFrame.dataRepresentation } : {})),
    ...(frameDraft?.bitNumbering !== undefined ? { bitNumbering: frameDraft.bitNumbering } : (selectedFrame?.bitNumbering ? { bitNumbering: selectedFrame.bitNumbering } : {})),
    ...(frameDraft?.trailerLength !== undefined ? { trailerLength: Number(frameDraft.trailerLength) || 0 } : (selectedFrame?.trailerLength !== undefined ? { trailerLength: selectedFrame.trailerLength } : {})),
  };

  if (frameDraft?.hasCrc !== undefined && frameDraft.hasCrc !== selectedFrame?.hasCrc) {
    data.hasCrc = frameDraft.hasCrc;
  }

  if (isCrcChanged) {
    if (frameDraft?.hasCrc === false) {
      data.crc = { enabled: false, algorithm: 'none' };
      data.hasCrc = false;
    } else if (frameDraft?.crc && typeof frameDraft.crc === 'object') {
      const sanitizedCrc = {};
      const framingKeys = new Set(['offset', 'length', 'coverage', 'coverageSemantics']);
      const isManualFraming = frameDraft.crc.offset !== undefined && frameDraft.crc.offset !== null && frameDraft.crc.offset !== '';

      for (const [k, v] of Object.entries(frameDraft.crc)) {
        if (v !== null && v !== undefined && v !== '') {
          if (framingKeys.has(k)) {
            // Only send framing fields if user manually configured non-default framing
            if (isManualFraming) {
              if (k === 'coverage') {
                if (Array.isArray(v) && v.length === 2) {
                  sanitizedCrc.coverage = [Number(v[0]), Number(v[1])];
                }
              } else if (k === 'coverageSemantics') {
                if (v === 'inclusive' || v === 'exclusive') {
                  sanitizedCrc.coverageSemantics = v;
                }
              } else {
                sanitizedCrc[k] = Number(v);
              }
            }
          } else {
            sanitizedCrc[k] = v;
          }
        }
      }

      // Preserve legacy semantics safety guard:
      // If sanitizedCrc includes coverage, ensure coverageSemantics is explicitly sent.
      // If frameDraft did not explicitly define semantics, inspect selectedFrame:
      // - If selectedFrame has 'inclusive', preserve 'inclusive'.
      // - If selectedFrame has missing/null/exclusive, send 'exclusive' to preserve legacy behavior and prevent backend auto-promotion.
      if (sanitizedCrc.coverage && !sanitizedCrc.coverageSemantics) {
        const existingSemantics = selectedFrame?.crc?.coverageSemantics;
        sanitizedCrc.coverageSemantics = existingSemantics === 'inclusive' ? 'inclusive' : 'exclusive';
      }

      if (Object.keys(sanitizedCrc).length > 0) {
        data.crc = sanitizedCrc;
      }
    }
  }

  // Send the timestamp only when the user changed it. The form fills in defaults
  // (e.g. a unit) the stored frame may not have, and re-sending them would
  // overwrite the imported configuration on every save. Without a stored frame
  // there is nothing to compare with, so the draft is sent as it is.
  if (frameDraft && 'timestamp' in frameDraft) {
    const draftTs = sanitizeTimestamp(frameDraft.timestamp);
    const changed = !selectedFrame
      || JSON.stringify(draftTs) !== JSON.stringify(sanitizeTimestamp(buildInitialTimestamp(selectedFrame)));
    if (changed) {
      if (draftTs === null) {
        data.timestamp = null;
      } else if (Object.keys(draftTs).length > 0) {
        data.timestamp = draftTs;
      }
    }
  }

  return data;
}

const LAYOUT_FORMAT_TO_UNIT = { epoch_ms: 'ms', epoch_s: 's' };

function hasValue(v) {
  return v !== undefined && v !== null && v !== '';
}

function firstValue(...values) {
  return values.find(hasValue);
}

/**
 * Timestamp settings the form starts from for a frame. When the frame has a
 * layout (as imported configs do), its timestamp is what the decoder uses, so
 * it wins over the top-level fields; the top-level fields come next, then the
 * form defaults.
 */
export function buildInitialTimestamp(frame) {
  const top = frame?.timestamp && typeof frame.timestamp === 'object' ? frame.timestamp : null;
  const lay = frame?.layout?.timestamp && typeof frame.layout.timestamp === 'object' ? frame.layout.timestamp : null;
  if (!top && !lay) return null;
  return {
    offset: firstValue(lay?.offset, top?.offset, 6),
    length: firstValue(lay?.length, top?.length, 4),
    endianness: firstValue(lay?.byteOrder, lay?.endianness, top?.endianness, 'LE'),
    unit: firstValue(LAYOUT_FORMAT_TO_UNIT[lay?.format], lay?.unit, top?.unit, 's'),
    epoch: firstValue(top?.epoch, 'unix'),
    enabled: top?.enabled !== false,
  };
}

/** The timestamp fields as they are sent to the API; null means disabled. */
function sanitizeTimestamp(timestamp) {
  if (!timestamp || typeof timestamp !== 'object' || timestamp.enabled === false) return null;
  const ts = {};
  if (hasValue(timestamp.offset)) ts.offset = Number(timestamp.offset);
  if (hasValue(timestamp.length)) ts.length = Number(timestamp.length);
  if (timestamp.endianness) ts.endianness = String(timestamp.endianness).toUpperCase();
  if (timestamp.unit) ts.unit = String(timestamp.unit).toLowerCase();
  if (timestamp.epoch) ts.epoch = timestamp.epoch;
  return ts;
}

