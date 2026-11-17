import { getLimitStatusBadge } from "../../utils/statusRepresentationHelper";
import { useState, useEffect, useMemo } from "react";
import { useSelector } from "react-redux";
import { selectSelectedProject } from "../../redux/slices/projectsSlice";
import HexStreamVisualizer from "./components/HexStreamVisualizer";
import {
  matchStatusRepresentation,
  getStatusRepresentationMatch,
  getStatusBadgeClass,
} from "../../utils/statusRepresentationHelper";
import StatusChip from "../../components/common/StatusChip";
import telemetryService from "../../services/telemetryService";
import configService from "../../services/configService";
import { formatByte } from "../../utils/formatters";
import { resolveCrcDisplayName } from "../../utils/crcPresets";
import {
  Search,
  Radio,
  CheckCircle,
  AlertTriangle,
  FileCode,
  RotateCcw,
  Satellite,
  Layers,
  Cpu,
  Hash,
  Clock,
  Sliders,
  Filter,
} from "lucide-react";



function formatHexCrc(val, length = 1) {
  if (val === null || val === undefined) return "--";
  const hex = (val >>> 0).toString(16).toUpperCase();
  return hex.padStart((length || 1) * 2, "0");
}

// Robust raw input parser supporting:
// 1. Spaced hex: "12 A0 32 C6 02..."
// 2. Unspaced continuous hex: "12A032C602..."
// 3. Log lines: "[2026/09/13 09:17:45.959] msg : 12 A0 32 C6..."
// 4. Prefixed hex: "0x12, 0xA0, 0x32..."
// 5. Braced analyzer lines: "## [4] time =[ 18361 : 18367 ] >> {C0 01 02 ...}<GOSTM...>"
function parseRawInputToBytes(input) {
  if (!input || typeof input !== "string") {
    return { bytes: [], hex: "", logTimestamp: null };
  }

  let text = input.trim();
  let logTimestamp = null;

  // Extract timestamp if present (time =[ ... ] or [2026/...])
  const timeMatch = text.match(/time\s*=\s*\[\s*([^\]]+)\s*\]/i);
  if (timeMatch) {
    logTimestamp = timeMatch[1].trim();
  } else {
    const bracketMatches = Array.from(text.matchAll(/\[([^\]]+)\]/g));
    for (const bm of bracketMatches) {
      const candidate = bm[1].trim();
      if (/\d/.test(candidate) && /[:\/-]/.test(candidate)) {
        logTimestamp = candidate;
        break;
      }
    }
  }

  // 1. Check for braces { HEX } (e.g. Serial Analyzer lines: "## [4] time =[ 18361 : 18367 ] >> {C0 01 02 ...}")
  const braceMatch = text.match(/\{([0-9A-Fa-f\s]{6,})\}/);
  if (braceMatch) {
    const tokens = braceMatch[1].trim().split(/\s+/).filter((t) => /^[0-9A-Fa-f]{2}$/.test(t));
    if (tokens.length >= 2) {
      const hex = tokens.join("").toUpperCase();
      const bytes = tokens.map((t) => parseInt(t, 16));
      return { bytes, hex, logTimestamp };
    }
  }

  // If a label like "msg :" or "raw :" or "data :" exists, isolate everything after it
  const msgIdx = text.search(/(?:msg|raw|data|stream|hex)\s*:/i);
  if (msgIdx !== -1) {
    const colonIdx = text.indexOf(":", msgIdx);
    if (colonIdx !== -1) {
      text = text.substring(colonIdx + 1);
    }
  }

  // 2. Maximal contiguous whitespace/comma-separated 2-hex-digit token runs (matching shared module token run extractor)
  const tokenRegex = /(?<![0-9A-Za-z])([0-9A-Fa-f]{2}(?:[\s,]+[0-9A-Fa-f]{2}){2,})(?![0-9A-Za-z])/g;
  let match;
  let longestRun = null;
  while ((match = tokenRegex.exec(text)) !== null) {
    const rawTokens = match[1].trim().split(/[\s,]+/);
    if (!longestRun || rawTokens.length > longestRun.length) {
      longestRun = rawTokens;
    }
  }

  if (longestRun && longestRun.length >= 2) {
    const hex = longestRun.join("").toUpperCase();
    const bytes = longestRun.map((t) => parseInt(t, 16));
    return { bytes, hex, logTimestamp };
  }

  // 3. Fallback: continuous unbroken pure hex string
  const cleanHex = text.replace(/\s+/g, "").replace(/^0x/gi, "");
  if (cleanHex.length >= 4 && cleanHex.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(cleanHex)) {
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      bytes.push(parseInt(cleanHex.substring(i, i + 2), 16));
    }
    return { bytes, hex: cleanHex.toUpperCase(), logTimestamp };
  }

  return { bytes: [], hex: "", logTimestamp };
}

export default function FrameInspectorPage() {
  const selectedProject = useSelector(selectSelectedProject);
  const [rawInput, setRawInput] = useState("");
  const [frame, setFrame] = useState(null);
  const [decodedResult, setDecodedResult] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState("info"); // "info" | "success" | "warning" | "error"
  const [paramFilter, setParamFilter] = useState("");
  const [availableFrames, setAvailableFrames] = useState([]);
  const [selectedFrameId, setSelectedFrameId] = useState("");

  const projectId = selectedProject?.id || selectedProject?._id;

  // Load project frame configurations for manual selection and template matching
  useEffect(() => {
    if (!projectId) return;
    let isMounted = true;
    configService
      .getConfiguration(projectId)
      .then((res) => {
        if (!isMounted) return;
        const configData = res?.data || res;
        const framesList = [];
        if (configData?.subsystems) {
          for (const sub of configData.subsystems) {
            for (const frm of sub.frames || []) {
              framesList.push({
                ...frm,
                subsystemName: sub.name,
                subsystemCode: sub.subsystemCode,
              });
            }
          }
        }
        setAvailableFrames(framesList);
      })
      .catch(() => {
        // Fallback gracefully if config is empty
      });

    return () => {
      isMounted = false;
    };
  }, [projectId]);

  // Build structured byte sections dynamically
  const buildFrameSections = (bytes, matchInfo = null) => {
    if (!bytes || bytes.length === 0) return null;

    const totalLen = bytes.length;
    let headerOffset = 0;
    let headerLength = 9;
    let payloadBaseOffset = 15;
    let delimiterStart = null;
    let delimiterLength = 0;

    if (matchInfo) {
      if (typeof matchInfo.headerOffset === "number" && matchInfo.headerOffset >= 0) {
        headerOffset = matchInfo.headerOffset;
      }
      if (typeof matchInfo.headerLength === "number" && matchInfo.headerLength > 0) {
        headerLength = matchInfo.headerLength;
      } else if (matchInfo.matchedHeader) {
        const cleanMatched = matchInfo.matchedHeader.replace(/\s+/g, "");
        headerLength = Math.max(1, Math.floor(cleanMatched.length / 2));
      }
      if (typeof matchInfo.payloadBaseOffset === "number" && matchInfo.payloadBaseOffset > 0) {
        payloadBaseOffset = matchInfo.payloadBaseOffset;
      }
      if (typeof matchInfo.delimiterFoundOffset === "number" && matchInfo.delimiterFoundOffset >= 0) {
        delimiterStart = matchInfo.delimiterFoundOffset;
        delimiterLength = matchInfo.delimiterLength || 4;
      } else if (matchInfo.payloadDelimiter) {
        const cleanDelim = matchInfo.payloadDelimiter.replace(/\s+/g, "");
        delimiterLength = Math.floor(cleanDelim.length / 2);
        if (payloadBaseOffset >= delimiterLength) {
          delimiterStart = payloadBaseOffset - delimiterLength;
        }
      }
    } else {
      // Heuristic fallback for standard protocols
      headerLength = 9;
      // Search for common payload delimiter 04 00 00 00
      let delimIdx = -1;
      for (let i = 11; i <= Math.min(totalLen - 4, 60); i++) {
        if (bytes[i] === 0x04 && bytes[i + 1] === 0x00 && bytes[i + 2] === 0x00 && bytes[i + 3] === 0x00) {
          delimIdx = i;
          break;
        }
      }
      if (delimIdx !== -1) {
        delimiterStart = delimIdx;
        delimiterLength = 4;
        payloadBaseOffset = delimIdx + 4;
      } else if (totalLen >= 40) {
        payloadBaseOffset = 40;
      } else if (totalLen >= 15) {
        payloadBaseOffset = 15;
      } else {
        payloadBaseOffset = Math.max(1, totalLen - 1);
      }
    }

    const sections = [];

    // 1. Unaligned stream prefix (noise/leading bytes if aligned offset > 0)
    if (headerOffset > 0 && headerOffset < totalLen) {
      sections.push({
        key: "prefix",
        label: "Stream Prefix",
        start: 0,
        end: headerOffset,
        className: "egse-hex-routing",
        badgeColor: "#64748b",
      });
    }

    // 2. Header
    const headerStart = headerOffset;
    const headerEnd = Math.min(totalLen, headerStart + headerLength);
    if (headerEnd > headerStart) {
      sections.push({
        key: "header",
        label: "Header",
        start: headerStart,
        end: headerEnd,
        className: "egse-hex-header",
        badgeColor: "#c084fc",
      });
    }

    // 3. Routing / Subsystem Code (between header and delimiter/payload)
    const subCodeStart = headerEnd;
    const subCodeEnd = Math.min(headerEnd + 2, totalLen);
    if (subCodeEnd > subCodeStart && payloadBaseOffset > (subCodeStart - headerStart)) {
      sections.push({
        key: "routing",
        label: "Subsystem Code",
        start: subCodeStart,
        end: subCodeEnd,
        className: "egse-hex-routing",
        badgeColor: "#60a5fa",
      });
    }

    // 4. Secondary Frame Metadata / Timestamps (between subsystem code and delimiter/payload)
    const effectiveDelimStart = delimiterStart !== null ? Math.max(subCodeEnd, headerStart + delimiterStart) : null;
    const metadataEnd = effectiveDelimStart !== null ? effectiveDelimStart : Math.min(headerStart + payloadBaseOffset, totalLen - 1);

    if (metadataEnd > subCodeEnd) {
      sections.push({
        key: "metadata",
        label: "Frame Metadata / Time",
        start: subCodeEnd,
        end: metadataEnd,
        className: "egse-hex-metadata",
        badgeColor: "#38bdf8",
      });
    }

    // 5. Delimiter Pattern
    if (effectiveDelimStart !== null && effectiveDelimStart < totalLen) {
      const delimEnd = Math.min(effectiveDelimStart + delimiterLength, headerStart + payloadBaseOffset, totalLen - 1);
      if (delimEnd > effectiveDelimStart) {
        sections.push({
          key: "delimiter",
          label: "Delimiter Pattern",
          start: effectiveDelimStart,
          end: delimEnd,
          className: "egse-hex-delimiter",
          badgeColor: "#2dd4bf",
        });
      }
    }

    // 7. Resolve CRC / Integrity details dynamically from backend matchInfo
    const detectedCrc = matchInfo?.detectedCrc || matchInfo?.crcDetails?.detectedCrc || null;
    const isAutoDetected = Boolean(matchInfo?.autoDetected || matchInfo?.crcDetails?.autoDetected || (matchInfo?.crcStatus === "SKIPPED" && detectedCrc));
    const crcStatus = matchInfo?.crcStatus || (detectedCrc ? "OK" : "SKIPPED");
    const crcDetails = matchInfo?.crcDetails || detectedCrc || null;
    const hasCrc = crcStatus !== "SKIPPED" && crcStatus !== "NOT_CONFIGURED" && matchInfo?.hasCrc !== false;

    let rawAlgo = (
      matchInfo?.crcAlgorithm ||
      crcDetails?.algorithm ||
      crcDetails?.type ||
      detectedCrc?.algorithm ||
      detectedCrc?.presetName ||
      matchInfo?.frame?.crc?.algorithm ||
      matchInfo?.frame?.crc?.type ||
      matchInfo?.layout?.crc?.algorithm ||
      (hasCrc ? "CRC" : "NONE")
    );

    if (String(rawAlgo).trim().toUpperCase() === "CUSTOM" && matchInfo?.frame?.crc) {
      rawAlgo = resolveCrcDisplayName(matchInfo.frame.crc);
    }

    const crcAlgo = (rawAlgo.includes("(") || rawAlgo.includes("/"))
      ? rawAlgo
      : rawAlgo.toUpperCase();

    const crcLength =
      matchInfo?.crcLength !== undefined && matchInfo?.crcLength !== null
        ? matchInfo.crcLength
        : crcDetails?.length !== undefined && crcDetails?.length !== null
        ? crcDetails.length
        : detectedCrc?.length !== undefined && detectedCrc?.length !== null
        ? detectedCrc.length
        : matchInfo?.frame?.crc?.length !== undefined && matchInfo?.frame?.crc?.length !== null
        ? matchInfo.frame.crc.length
        : (hasCrc ? (crcAlgo.includes("32") ? 4 : crcAlgo.includes("16") ? 2 : 1) : 0);

    const crcOffset =
      typeof matchInfo?.crcOffset === "number" && matchInfo.crcOffset >= 0
        ? matchInfo.crcOffset
        : typeof crcDetails?.offset === "number" && crcDetails.offset >= 0
        ? crcDetails.offset
        : typeof detectedCrc?.offset === "number" && detectedCrc.offset >= 0
        ? detectedCrc.offset
        : typeof matchInfo?.frame?.crc?.offset === "number" && matchInfo.frame.crc.offset >= 0
        ? matchInfo.frame.crc.offset
        : (hasCrc && crcLength > 0 ? Math.max(0, totalLen - crcLength) : totalLen);

    const crcStart = Math.min(totalLen, crcOffset);
    const crcEnd = Math.min(totalLen, crcStart + crcLength);

    // 6. Payload Body
    const payloadStart = Math.min(totalLen, headerStart + payloadBaseOffset);
    const payloadEnd = Math.max(payloadStart, hasCrc && crcLength > 0 ? crcStart : totalLen);
    if (payloadEnd > payloadStart) {
      sections.push({
        key: "payload",
        label: "Payload Body",
        start: payloadStart,
        end: payloadEnd,
        className: "egse-hex-payload",
        badgeColor: "#fbbf24",
      });
    }

    let crcOk = false;
    let computedCrc = crcDetails?.computed ?? detectedCrc?.computed ?? null;
    let receivedCrc = crcDetails?.received ?? detectedCrc?.received ?? null;

    if (hasCrc && crcLength > 0 && crcEnd > crcStart) {
      crcOk = crcStatus === "OK";

      let sectionClass = "egse-hex-crc-bad";
      let badgeColor = "var(--egse-alarm, #ef4444)";
      let sectionLabel = isAutoDetected ? `${crcAlgo} (Auto-Detected)` : `${crcAlgo} Checksum`;

      if (crcStatus === "OK") {
        sectionClass = "egse-hex-crc-ok";
        badgeColor = "var(--egse-nominal, #34d399)";
      } else if (crcStatus === "CONFIG_ERROR") {
        sectionClass = "egse-hex-crc-warning";
        badgeColor = "var(--egse-warning, #fbbf24)";
        sectionLabel = `${crcAlgo} (Config Error)`;
      } else if (crcStatus === "NOT_CHECKED") {
        sectionClass = "egse-hex-crc-warning";
        badgeColor = "var(--egse-warning, #fbbf24)";
        sectionLabel = `${crcAlgo} (Not Checked)`;
      }

      sections.push({
        key: "crc",
        label: sectionLabel,
        start: crcStart,
        end: crcEnd,
        className: sectionClass,
        badgeColor: badgeColor,
      });

      if (crcEnd < totalLen) {
        sections.push({
          key: "trailer",
          label: "Frame Trailer",
          start: crcEnd,
          end: totalLen,
          className: "egse-hex-routing",
          badgeColor: "#94a3b8",
        });
      }
    }

    // Resolve CRC coverage and effective semantics
    let crcCoverageText = null;
    const effectiveCoverage = matchInfo?.effectiveCoverage || matchInfo?.crcDetails?.effectiveCoverage || null;

    if (effectiveCoverage) {
      const { start, endExclusive, mode, byteCount, raw, isLegacy } = effectiveCoverage;
      const isInc = mode === "inclusive";
      let modeText = "";
      if (isInc) {
        const rawBounds = Array.isArray(raw) ? ` [${raw[0]},${raw[1]}]` : ` [${start},${endExclusive - 1}]`;
        modeText = ` (Inclusive${rawBounds})`;
      } else if (isLegacy) {
        modeText = " (Exclusive (Legacy))";
      } else {
        const rawBounds = Array.isArray(raw) ? ` [${raw[0]},${raw[1]}]` : ` [${start},${endExclusive}]`;
        modeText = ` (Exclusive${rawBounds})`;
      }
      crcCoverageText = `Coverage: [${start} .. ${endExclusive}) · ${byteCount} byte${byteCount === 1 ? "" : "s"}${modeText}`;
    } else if (hasCrc && crcLength > 0 && crcStatus !== "SKIPPED" && crcStatus !== "NOT_CONFIGURED") {
      // Fallback if effectiveCoverage not provided by backend (e.g. mock)
      const rawCoverage = matchInfo?.coverage || matchInfo?.crcDetails?.coverage || matchInfo?.frame?.crc?.coverage || matchInfo?.layout?.crc?.coverage;
      const rawSemantics = matchInfo?.coverageSemantics || matchInfo?.crcDetails?.coverageSemantics || matchInfo?.frame?.crc?.coverageSemantics || matchInfo?.layout?.crc?.coverageSemantics;
      const hasConfig = Array.isArray(rawCoverage) && rawCoverage.length === 2;
      const start = hasConfig ? rawCoverage[0] : 0;
      const isInc = rawSemantics === "inclusive";
      const isExc = rawSemantics === "exclusive";
      const endExclusive = hasConfig
        ? (isInc ? rawCoverage[1] + 1 : rawCoverage[1])
        : crcOffset;
      const byteCount = Math.max(0, endExclusive - start);
      if (isInc) {
        crcCoverageText = `Coverage: [${start} .. ${endExclusive}) · ${byteCount} byte${byteCount === 1 ? "" : "s"} (Inclusive [${start},${hasConfig ? rawCoverage[1] : endExclusive - 1}])`;
      } else if (isExc) {
        crcCoverageText = `Coverage: [${start} .. ${endExclusive}) · ${byteCount} byte${byteCount === 1 ? "" : "s"} (Exclusive${hasConfig ? ` [${start},${rawCoverage[1]}]` : ""})`;
      } else {
        crcCoverageText = `Coverage: [${start} .. ${endExclusive}) · ${byteCount} byte${byteCount === 1 ? "" : "s"} (Exclusive (Legacy))`;
      }
    }

    if (computedCrc !== null && computedCrc !== undefined && typeof window !== "undefined") {
      try {
        sessionStorage.setItem("last_inspected_frame_crc", formatHexCrc(computedCrc, crcLength));
      } catch (_) {}
    }

    return {
      bytes,
      sections,
      crcOk,
      crcStatus,
      crcAlgo,
      crcLength,
      crcOffset,
      crcCoverageText,
      crcError: crcDetails?.error || null,
      crcWarning: crcDetails?.warning || null,
      trailingBytesIgnored: matchInfo?.trailingBytesIgnored ?? 0,
      crcComputed: computedCrc,
      crcReceived: receivedCrc,
      crcCoverage: crcDetails?.coverage ?? null,
      crcByteOrder: crcDetails?.byteOrder ?? null,
      effectiveCoverage,
      isAutoDetected,
      detectedCrc,
      // Backward compatibility slices
      header: bytes.slice(headerStart, headerEnd),
      routing: bytes.slice(subCodeStart, subCodeEnd),
      metadata: bytes.slice(subCodeEnd, metadataEnd),
      delimiter: effectiveDelimStart !== null ? bytes.slice(effectiveDelimStart, effectiveDelimStart + delimiterLength) : [],
      payload: bytes.slice(payloadStart, payloadEnd),
      crc: hasCrc && crcLength > 0 ? bytes.slice(crcStart, crcEnd) : [],
    };
  };

  // Main Parsing & Identification flow
  const handleParse = async (inputOverride, forcedFrameId = null) => {
    const raw = (typeof inputOverride === "string" ? inputOverride : rawInput).trim();
    if (!raw) {
      setNotice("Please enter or paste a raw hexadecimal byte stream first.");
      setNoticeType("warning");
      return;
    }

    // 1. Sanitize & extract raw bytes
    const parsed = parseRawInputToBytes(raw);
    if (!parsed.bytes || parsed.bytes.length < 2) {
      setNotice("Invalid hexadecimal stream. Ensure input contains valid hex characters (0-9, A-F).");
      setNoticeType("error");
      setFrame(null);
      setDecodedResult(null);
      return;
    }

    const { bytes, hex, logTimestamp } = parsed;

    // 2. Perform initial local breakdown
    const localFrame = buildFrameSections(bytes);
    setFrame(localFrame);
    setDecodedResult(null);
    setIsLoading(true);
    setNotice("");

    // 3. Connect to Backend for project-level frame matching and decoding
    try {
      const activeProjId = projectId;
      let matchedData = null;

      // Option A: If a specific frame is chosen manually, use decodeSingleFrame
      const targetFrame = forcedFrameId || selectedFrameId;
      if (targetFrame && activeProjId) {
        const decodeRes = await telemetryService.decodeSingleFrame({
          raw,
          rawHex: hex || raw,
          projectId: activeProjId,
          frameId: targetFrame,
        });
        const d = decodeRes?.data || decodeRes;
        if (d?.readings) {
          matchedData = {
            matched: true,
            frameName: d.frameName || "Selected Frame",
            subsystemName: "Project Subsystem",
            protocol: "Generic",
            payloadBaseOffset: d.payloadBaseOffset,
            payloadDelimiter: d.payloadDelimiter,
            delimiterFoundOffset: d.delimiterFoundOffset,
            delimiterLength: d.delimiterLength,
            headerLength: d.headerLength,
            crcStatus: d.crcStatus,
            crcDetails: d.crcDetails,
            crcAlgorithm: d.crcAlgorithm,
            crcOffset: d.crcOffset,
            crcLength: d.crcLength,
            detectedCrc: d.detectedCrc,
            allDetectedCrcs: d.allDetectedCrcs,
            coverage: d.coverage ?? d.crcDetails?.coverage ?? null,
            coverageSemantics: d.coverageSemantics ?? d.crcDetails?.coverageSemantics ?? null,
            effectiveCoverage: d.effectiveCoverage ?? d.crcDetails?.effectiveCoverage ?? null,
            hasCrc: d.hasCrc,
            expectedLength: d.expectedLength ?? null,
            warnings: d.warnings || [],
            trailingBytesIgnored: d.trailingBytesIgnored ?? 0,
            readings: d.readings,
            logTimestamp,
            rawHex: d.rawHex,
          };
        }
      }

      // Option B: Search and identify frame by configured headers
      if (!matchedData) {
        const searchPayload = { raw, rawHex: hex || raw };
        if (activeProjId) searchPayload.projectId = activeProjId;

        const res = await telemetryService.searchFrame(searchPayload);
        const data = res?.data || res;

        if (data && data.matched) {
          matchedData = data;
        } else if (activeProjId) {
          // Fallback: try decodeSingleFrame without frameId to let backend auto-resolve
          try {
            const decodeRes = await telemetryService.decodeSingleFrame({
              raw,
              rawHex: hex || raw,
              projectId: activeProjId,
            });
            const d = decodeRes?.data || decodeRes;
            if (d && d.readings) {
              matchedData = {
                matched: true,
                frameName: d.frameName || "Decoded Frame",
                subsystemName: d.subsystemName || "Subsystem",
                protocol: d.protocol || "Generic",
                payloadBaseOffset: d.payloadBaseOffset,
                payloadDelimiter: d.payloadDelimiter,
                delimiterFoundOffset: d.delimiterFoundOffset,
                delimiterLength: d.delimiterLength,
                headerLength: d.headerLength,
                crcStatus: d.crcStatus,
                crcDetails: d.crcDetails,
                crcAlgorithm: d.crcAlgorithm,
                crcOffset: d.crcOffset,
                crcLength: d.crcLength,
                detectedCrc: d.detectedCrc,
                allDetectedCrcs: d.allDetectedCrcs,
                coverage: d.coverage ?? d.crcDetails?.coverage ?? null,
                coverageSemantics: d.coverageSemantics ?? d.crcDetails?.coverageSemantics ?? null,
                effectiveCoverage: d.effectiveCoverage ?? d.crcDetails?.effectiveCoverage ?? null,
                hasCrc: d.hasCrc,
                expectedLength: d.expectedLength ?? null,
                warnings: d.warnings || [],
                trailingBytesIgnored: d.trailingBytesIgnored ?? 0,
                readings: d.readings,
                logTimestamp,
                rawHex: d.rawHex,
              };
            }
          } catch {
            // No auto-decode match
          }
        }
      }

      if (matchedData && matchedData.matched) {
        setDecodedResult(matchedData);
        // Re-align byte sections with backend matched layout using exact extracted bytes from shared module
        const serverHex = matchedData.rawHex;
        const serverBytes = serverHex && serverHex.length >= 2
          ? (serverHex.match(/../g) || []).map((h) => parseInt(h, 16))
          : bytes;
        const alignedFrame = buildFrameSections(serverBytes, matchedData);
        setFrame(alignedFrame);

        setNotice(
          `Frame matched: "${matchedData.frameName}" (${matchedData.subsystemName || matchedData.subsystemCode || "Subsystem"}). Decoded ${matchedData.readings?.length || 0} telemetry parameters.`
        );
        setNoticeType("success");
      } else {
        const serverHex = matchedData?.rawHex;
        const effectiveBytes = serverHex && serverHex.length >= 2
          ? (serverHex.match(/../g) || []).map((h) => parseInt(h, 16))
          : bytes;

        if (matchedData && (matchedData.detectedCrc || matchedData.crcAlgorithm)) {
          const alignedFrame = buildFrameSections(effectiveBytes, matchedData);
          setFrame(alignedFrame);
          const detName = matchedData.detectedCrc?.name || matchedData.detectedCrc?.algorithm || matchedData.crcAlgorithm;
          setNotice(
            `Parsed ${effectiveBytes.length} bytes successfully. Detected CRC: ${detName} (OK). Header did not match any stored frame for "${selectedProject?.name || "this project"}".`
          );
          setNoticeType("info");
        } else {
          if (effectiveBytes.length !== bytes.length) {
            const alignedFrame = buildFrameSections(effectiveBytes, matchedData);
            setFrame(alignedFrame);
          }
          setNotice(
            `Parsed ${effectiveBytes.length} bytes successfully. Header did not match any stored frame for "${selectedProject?.name || "this project"}".`
          );
          setNoticeType("info");
        }
      }
    } catch (err) {
      setNotice(
        `Parsed ${bytes.length} bytes locally. Backend verification note: ${err?.message || "Could not query project frames"}`
      );
      setNoticeType("warning");
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch latest frame ingested into the system
  const handleFetchLatest = async () => {
    if (!projectId) {
      setNotice("Please select a project from the top navigation bar first.");
      setNoticeType("warning");
      return;
    }

    setIsLoading(true);
    setNotice("");
    try {
      const res = await telemetryService.getCurrentTelemetry({ projectId });
      const record = res?.data || res;

      // Check if current telemetry contains rawHex/rawBytes
      let rawHexFound = null;
      if (record?.rawBytes) rawHexFound = record.rawBytes;
      else if (record?.rawHex) rawHexFound = record.rawHex;
      else if (Array.isArray(record?.frames) && record.frames.length > 0) {
        const f0 = record.frames[0];
        if (f0.rawBytes || f0.rawHex) rawHexFound = f0.rawBytes || f0.rawHex;
      }

      if (rawHexFound) {
        setRawInput(rawHexFound);
        await handleParse(rawHexFound);
        return;
      }

      // If already decoded in DB without stored raw bytes
      if (record?.readings || (Array.isArray(record?.frames) && record.frames[0]?.readings)) {
        const readings = record.readings || record.frames[0].readings;
        setNotice("Retrieved latest decoded telemetry snapshot from database.");
        setNoticeType("info");
        setDecodedResult({
          matched: true,
          frameName: record.frameName || record.frames?.[0]?.frameName || "Latest Frame",
          subsystemName: record.subsystemName || record.frames?.[0]?.subsystemName || "Subsystem",
          protocol: record.protocol || "Generic",
          readings,
        });
      } else {
        setNotice("No telemetry data captured for this project yet. Ingest a log file or paste a frame.");
        setNoticeType("info");
      }
    } catch {
      setNotice("Could not fetch latest frame from server. Check server connection.");
      setNoticeType("error");
    } finally {
      setIsLoading(false);
    }
  };

  // Sample presets for quick testing
  const loadSample = (sampleType) => {
    let sample = "";
    if (sampleType === "standard") {
      sample =
        "12 A0 32 AB 02 00 00 01 50 00 01 04 00 00 00 00 00 00 00 00 08 2A 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 05 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 4B";
    } else if (sampleType === "log") {
      sample =
        "[2026/09/13 09:17:45.959] msg : 12 A0 32 C6 02 00 00 01 50 00 01 04 00 00 00 00 00 00 00 00 08 2A 00 00 00 92";
    } else if (sampleType === "continuous") {
      sample =
        "12A032C602000001500001040000000000000000082A00000092";
    }
    setRawInput(sample);
    handleParse(sample);
  };

  const handleClear = () => {
    setRawInput("");
    setFrame(null);
    setDecodedResult(null);
    setNotice("");
    setSelectedFrameId("");
  };

  // Filtered readings list
  const filteredReadings = useMemo(() => {
    if (!decodedResult?.readings || !Array.isArray(decodedResult.readings)) return [];
    if (!paramFilter.trim()) return decodedResult.readings;
    const q = paramFilter.trim().toLowerCase();
    return decodedResult.readings.filter(
      (r) =>
        r.parameterName?.toLowerCase().includes(q) ||
        String(r.rawValue).toLowerCase().includes(q) ||
        String(r.engineeringValue).toLowerCase().includes(q)
    );
  }, [decodedResult, paramFilter]);

  return (
    <div>
      {/* Header Bar */}
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-3">
        <div>
          <div className="d-flex align-items-center gap-2">
            <Search size={22} className="text-info" />
            <h1 className="egse-heading h4 mb-0">Raw Frame Inspector</h1>
          </div>
          <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
            {selectedProject?.name || "Active Project"} · Low-level byte verification, dynamic layout parsing, and CRC calculation
          </p>
        </div>

        {/* Quick Sample Presets */}
        {/* <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="small text-muted d-none d-md-inline">Quick Samples:</span>
          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={() => loadSample("standard")}
            disabled={isLoading}
          >
            <Satellite size={12} className="me-1 text-warning" /> Standard Frame
          </button>
          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={() => loadSample("log")}
            disabled={isLoading}
          >
            <Clock size={12} className="me-1 text-info" /> Log Line
          </button>
          <button
            type="button"
            className="btn btn-sm btn-egse-outline"
            onClick={() => loadSample("continuous")}
            disabled={isLoading}
          >
            <Hash size={12} className="me-1 text-success" /> Continuous Hex
          </button>
        </div> */}
      </div>

      {/* Notice Banner */}
      {notice && (
        <div
          className={`alert ${noticeType === "success"
            ? "alert-success"
            : noticeType === "warning"
              ? "alert-warning"
              : noticeType === "error"
                ? "alert-danger"
                : "alert-info"
            } py-2 px-3 small d-flex align-items-center justify-content-between gap-2 mb-3 shadow-sm`}
        >
          <div className="d-flex align-items-center gap-2">
            {noticeType === "success" ? (
              <CheckCircle size={16} />
            ) : noticeType === "error" ? (
              <AlertTriangle size={16} />
            ) : (
              <FileCode size={16} />
            )}
            <span>{notice}</span>
          </div>
          <button
            type="button"
            className="btn-close btn-close-white small"
            style={{ fontSize: "0.7rem" }}
            onClick={() => setNotice("")}
          />
        </div>
      )}

      {/* Input Panel */}
      <div className="egse-panel mb-3">
        <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
          <div className="d-flex align-items-center gap-2">
            <h3 className="egse-panel-title mb-0"> Raw Telemetry Byte Stream</h3>
            <span className="badge bg-secondary small" style={{ fontSize: "0.72rem" }}>

            </span>
          </div>

          <div className="d-flex flex-wrap gap-2 align-items-center">
            {/* Optional Frame Target Dropdown */}
            {availableFrames.length > 0 && (
              <select
                className="form-select form-select-sm egse-field py-1"
                style={{ width: "auto", fontSize: "0.82rem" }}
                value={selectedFrameId}
                onChange={(e) => {
                  setSelectedFrameId(e.target.value);
                  if (rawInput.trim()) {
                    handleParse(rawInput, e.target.value);
                  }
                }}
              >
                <option value="">Auto-Detect Frame Header</option>
                {availableFrames.map((f) => (
                  <option key={f._id || f.id} value={f._id || f.id}>
                    Target: {f.name} ({f.subsystemCode || f.subsystemName})
                  </option>
                ))}
              </select>
            )}

            {/* <button
              type="button"
              className="btn btn-sm btn-egse-outline d-flex align-items-center gap-1"
              onClick={handleFetchLatest}
              disabled={isLoading}
              title="Retrieve most recent captured telemetry frame from database"
            >
              <Radio size={14} /> Fetch Latest
            </button> */}
            <button
              type="button"
              className="btn btn-sm btn-egse-outline text-danger d-flex align-items-center gap-1"
              onClick={handleClear}
              disabled={isLoading || (!rawInput && !frame)}
              title="Clear input and visualizer"
            >
              <RotateCcw size={14} /> Clear
            </button>
            <button
              type="button"
              className="btn btn-sm btn-egse-primary d-flex align-items-center gap-1"
              onClick={() => handleParse()}
              disabled={isLoading || !rawInput.trim()}
            >
              <Search size={14} /> {isLoading ? "Parsing..." : "Parse Frame"}
            </button>
          </div>
        </div>

        <div className="egse-panel-body">
          <textarea
            className="form-control egse-field egse-mono"
            style={{ minHeight: 95, fontSize: "0.88rem", letterSpacing: "0.03em" }}
            placeholder="Paste raw hex (e.g. 12 A0 32 C6 02 00 00 22 50...) or log line (e.g. [2026/09/13 09:17:45] msg : 12 A0 32...)"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleParse();
              }
            }}
          />
          <div className="d-flex justify-content-between align-items-center mt-2 small text-muted">
            <span>
              Tip: Press <kbd className="egse-pill px-2 py-0 rounded">Ctrl + Enter</kbd> to parse instantly.
            </span>
            {frame && (
              <span>
                Total Extracted: <strong>{frame.bytes.length} bytes</strong> ({frame.bytes.length * 8} bits)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Frame Identification & Status Summary Card */}
      {frame && (
        <div className="row g-3 mb-3">
          <div className="col-12 col-md-4">
            <div className="egse-panel h-100 p-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <Layers size={18} className="text-info" />
                <span className="fw-semibold small text-uppercase" style={{ color: "var(--egse-text-secondary)" }}>
                  Frame Identification
                </span>
              </div>
              <div className="h5 mb-1 text-truncate" style={{ color: "var(--egse-text-primary)" }}>
                {decodedResult?.frameName || (decodedResult?.matched ? "Identified Frame" : "Generic TLM Frame")}
              </div>
              <div className="small text-muted d-flex align-items-center gap-2">
                <span>Subsystem:</span>
                <strong className="text-info">
                  {decodedResult?.subsystemName || decodedResult?.subsystemCode || "Unassigned"}
                </strong>
                <span>·</span>
                <span className="badge egse-pill px-2 py-1">{decodedResult?.protocol || "Generic"}</span>
              </div>
            </div>
          </div>

          <div className="col-12 col-md-4">
            <div className="egse-panel h-100 p-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <div className="d-flex align-items-center gap-2">
                  <Cpu size={18} className="text-success" />
                  <span className="fw-semibold small text-uppercase" style={{ color: "var(--egse-text-secondary)" }}>
                    Integrity Verification
                  </span>
                </div>
                {frame.isAutoDetected && (
                  <span className="badge bg-primary text-white" style={{ fontSize: "0.68rem" }}>
                    Auto-Detected
                  </span>
                )}
              </div>
              <div className="d-flex align-items-center gap-2 mb-1">
                {frame.crcStatus === "SKIPPED" || frame.crcStatus === "NOT_CONFIGURED" ? (
                  frame.detectedCrc ? (
                    <StatusChip
                      level="nominal"
                      label={`${frame.detectedCrc.algorithm || frame.detectedCrc.name || "CRC"} OK (Auto-Detected)`}
                    />
                  ) : (
                    <StatusChip
                      level="neutral"
                      label="NOT CONFIGURED"
                    />
                  )
                ) : frame.crcStatus === "CONFIG_ERROR" ? (
                  <StatusChip
                    level="warning"
                    label="CONFIG ERROR"
                  />
                ) : frame.crcStatus === "NOT_CHECKED" ? (
                  <StatusChip level="warning" label="CRC NOT CHECKED" />
                ) : (
                  <StatusChip
                    level={frame.crcOk ? "nominal" : "alarm"}
                    label={frame.crcOk ? `${frame.crcAlgo || "CRC"} OK` : `${frame.crcAlgo || "CRC"} FAIL`}
                  />
                )}
              </div>
              <div className="small text-muted egse-mono">
                {frame.crcStatus === "SKIPPED" || frame.crcStatus === "NOT_CONFIGURED" ? (
                  frame.detectedCrc ? (
                    <>
                      Computed: <code>0x{formatHexCrc(frame.crcComputed, frame.crcLength)}</code> · Received:{" "}
                      <code>0x{formatHexCrc(frame.crcReceived, frame.crcLength)}</code>
                    </>
                  ) : (
                    <span>CRC check disabled / not configured</span>
                  )
                ) : frame.crcStatus === "CONFIG_ERROR" ? (
                  <span className="text-warning">{frame.crcError || "Invalid coverage bounds"}</span>
                ) : frame.crcStatus === "NOT_CHECKED" ? (
                  <span className="text-warning">{frame.crcWarning || "Frame shorter than configured total length — CRC not evaluated"}</span>
                ) : (
                  <>
                    Computed: <code>0x{formatHexCrc(frame.crcComputed, frame.crcLength)}</code> · Received:{" "}
                    <code>0x{formatHexCrc(frame.crcReceived, frame.crcLength)}</code>
                  </>
                )}
              </div>
              {frame.crcCoverageText && (
                <div id="frame-inspector-crc-coverage" className="small text-muted mt-1 egse-mono">
                  {frame.crcCoverageText}
                </div>
              )}
              {(frame.crcStatus === "FAIL" || frame.crcStatus === "CONFIG_ERROR") &&
                (frame.crcCoverage || frame.crcByteOrder) && (
                  <div className="small text-muted mt-1 egse-mono">
                    Resolved config: coverage [{frame.crcCoverage?.[0]}..{frame.crcCoverage?.[1]}] · offset {frame.crcOffset} · length {frame.crcLength} · byte order {frame.crcByteOrder || "--"}
                  </div>
                )}
              {frame.crcStatus === "FAIL" && (
                <div className="small text-warning mt-1">
                  Configured CRC failed — verify the algorithm, offset and coverage in the frame configuration.
                </div>
              )}
              {frame.trailingBytesIgnored > 0 && (
                <div className="small text-muted mt-1 egse-mono">
                  {frame.trailingBytesIgnored} trailing byte(s) ignored (line longer than configured frame length).
                </div>
              )}
            </div>
          </div>

          <div className="col-12 col-md-4">
            <div className="egse-panel h-100 p-3">
              <div className="d-flex align-items-center gap-2 mb-2">
                <Sliders size={18} className="text-warning" />
                <span className="fw-semibold small text-uppercase" style={{ color: "var(--egse-text-secondary)" }}>
                  Frame Dimensions
                </span>
              </div>
              <div className="h5 mb-1" style={{ color: "var(--egse-text-primary)" }}>
                {frame.bytes.length} <span className="small text-muted">Bytes</span>
              </div>
              <div className="small text-muted">
                Payload Offset: <strong>#{decodedResult?.payloadBaseOffset ?? 15}</strong> · Parameters:{" "}
                <strong>{decodedResult?.readings?.length || 0}</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Byte Breakdown Visualizer Panel */}
      <div className="egse-panel mb-3">
        <div className="egse-panel-header d-flex align-items-center justify-content-between">
          <h3 className="egse-panel-title mb-0">🔎 Protocol Byte Breakdown & Visualizer</h3>
          {frame && (
            <span className="small text-muted egse-mono">
              Hover over any byte to inspect bit-level registers
            </span>
          )}
        </div>
        <div className="egse-panel-body">
          {frame ? (
            <HexStreamVisualizer frame={frame} decodedResult={decodedResult} />
          ) : (
            <div className="small text-center py-4" style={{ color: "var(--egse-text-muted)" }}>
              Paste a hexadecimal byte sequence above and click &quot;Parse Frame&quot; to inspect its frame layout.
            </div>
          )}
        </div>
      </div>

      {/* Decoded Parameters Table Panel */}
      {decodedResult?.readings && decodedResult.readings.length > 0 && (
        <div className="egse-panel mb-4">
          <div className="egse-panel-header d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div className="d-flex align-items-center gap-2">
              <h3 className="egse-panel-title mb-0">📊 Decoded Telemetry Parameters</h3>
              <span className="badge bg-info text-dark fw-bold">
                {filteredReadings.length} / {decodedResult.readings.length}
              </span>
            </div>

            <div className="d-flex align-items-center gap-2" style={{ maxWidth: 280 }}>
              <div className="input-group input-group-sm">
                <span className="input-group-text egse-field text-muted" style={{ borderRight: 0 }}>
                  <Filter size={13} />
                </span>
                <input
                  type="text"
                  className="form-control egse-field py-1"
                  placeholder="Filter parameters..."
                  value={paramFilter}
                  onChange={(e) => setParamFilter(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="egse-panel-body p-0">
            <div className="table-responsive">
              <table className="table egse-table table-sm mb-0">
                <thead>
                  <tr>
                    <th style={{ width: "32%" }}>Parameter</th>
                    <th style={{ width: "22%" }}>Raw Value</th>
                    <th style={{ width: "26%" }}>Engineering Value</th>
                    <th style={{ width: "10%" }}>Unit</th>
                    <th style={{ width: "10%" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReadings.map((r, i) => (
                    <tr key={r.parameterId || r.parameterName || i}>
                      <td className="fw-semibold">
                        <span className="d-block text-truncate" title={r.parameterName}>
                          {r.parameterName}
                        </span>
                      </td>
                      <td>
                        <div className="d-inline-flex align-items-center gap-1 flex-wrap">
                          <code className="text-warning">
                            {typeof r.rawValue === "number"
                              ? `0x${r.rawValue.toString(16).toUpperCase()} (${r.rawValue})`
                              : String(r.rawValue ?? "—")}
                          </code>
                        </div>
                      </td>
                      <td className="fw-bold" style={{ color: "var(--egse-text-primary)" }}>
                        {(() => {
                          const match = getStatusRepresentationMatch(r.engineeringValue, r.statusRepresentation);
                          const statusLabel = match?.status || r.statusLabel;
                          const statusDesc = match?.description;

                          if (statusLabel) {
                            const badgeClass = getStatusBadgeClass(statusLabel);
                            return (
                              <div className="d-inline-flex flex-column align-items-start gap-1">
                                <div className="d-inline-flex align-items-center gap-1 flex-wrap">
                                  <span
                                    className={`${badgeClass} fw-bold`}
                                    style={{ fontSize: "0.82rem", padding: "3px 8px" }}
                                    title={`Status: ${statusLabel}${statusDesc ? ` · ${statusDesc}` : ""}\nEngineering: ${r.engineeringValue}`}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span
                                    className="font-monospace text-secondary small"
                                    style={{ fontSize: "0.75rem" }}
                                  >
                                    ({String(r.engineeringValue ?? "—")})
                                  </span>
                                </div>
                                {statusDesc && (
                                  <div
                                    className="small text-muted text-truncate"
                                    style={{ maxWidth: "220px", fontSize: "0.7rem", lineHeight: 1.2 }}
                                    title={statusDesc}
                                  >
                                    {statusDesc}
                                  </div>
                                )}
                              </div>
                            );
                          }

                          return <span>{String(r.engineeringValue ?? "—")}</span>;
                        })()}
                      </td>
                      <td style={{ color: "var(--egse-text-secondary)" }}>{r.unit || "—"}</td>
                      <td>
                        <span
                          {...getLimitStatusBadge(r.limitStatus)}
                        >
                          {r.limitStatus || "normal"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
