import React, { useState, useEffect, useMemo, useContext, useCallback, useRef } from "react";
import { ReactReduxContext } from "react-redux";
import configService from "../services/configService";
import { CheckCircle2, AlertTriangle, Info, RefreshCw, BookmarkPlus, RotateCcw, Trash2, Edit2, ChevronDown, ChevronRight, Sliders } from "lucide-react";
import { findMatchingPreset, parseHexToBigInt, toDisplayHex } from "../utils/crcPresets";


/**
 * Formats value for server transmission ("0x"-prefixed uppercase hex string).
 */
function toServerHex(val, width = 16) {
  if (val === null || val === undefined || val === "") return "";
  const s = String(val).trim().replace(/^0x/i, "").toUpperCase();
  if (!s) return "";
  const hexDigits = Math.max(2, Math.ceil(width / 4));
  const padded = s.padStart(hexDigits, "0");
  return "0x" + padded;
}

/**
 * Calculates max value for width using BigInt ONLY for range checks.
 */
function getMaxValForWidth(width) {
  const w = Number(width);
  if (!Number.isInteger(w) || w < 1 || w > 64) return 0n;
  if (w >= 64) return 0xFFFFFFFFFFFFFFFFn;
  return (1n << BigInt(w)) - 1n;
}

/**
 * Checks if bigInt value fits in width bits.
 */
function fitsInWidth(bigIntVal, width) {
  if (bigIntVal === null) return true;
  if (bigIntVal < 0n) return false;
  const maxVal = getMaxValForWidth(width);
  return bigIntVal <= maxVal;
}

const KNOWN_PRESET_CHECKS = Object.freeze({
  "CRC-16/MCRF4XX": "6F91",
  "CRC-16/CCITT-FALSE": "29B1",
  "CRC-16/XMODEM": "31C3",
  "CRC-16/MODBUS": "4B37",
  "CRC-32": "CBF43926",
  "CRC-32/ISO-HDLC": "CBF43926",
  "CRC-8": "F4",
});

const DEFAULT_EMPTY_CRC = Object.freeze({});

export default function CrcConfigSection({
  crc = DEFAULT_EMPTY_CRC,
  hasCrc = true,
  onChange,
  disabled = false,
  serverErrors = {},
  role: propRole,
  totalFrameLength = 0,
  sampleFrameCrc = null,
}) {
  // Advanced framing states
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [prevOffsetProp, setPrevOffsetProp] = useState(crc?.offset);
  const [isTrailerAtEnd, setIsTrailerAtEnd] = useState(crc?.offset === null || crc?.offset === undefined);

  if (crc?.offset !== prevOffsetProp) {
    setPrevOffsetProp(crc?.offset);
    setIsTrailerAtEnd(crc?.offset === null || crc?.offset === undefined);
  }
  // Determine user role safely (compatible with Redux store or standalone usage)
  const reduxContext = useContext(ReactReduxContext);
  const state = reduxContext?.store?.getState?.();
  const reduxRole = state?.auth?.user?.role;
  const effectiveRole = propRole || reduxRole || "admin";
  const isDeveloper = effectiveRole === "admin" || effectiveRole === "developer";

  const [presets, setPresets] = useState([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(true);
  const [presetLoadError, setPresetLoadError] = useState(null);
  const [actionMessage, setActionMessage] = useState(null); // { type: 'success' | 'danger', text: '' }

  // Save Modal States
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  // Edit Preset Modal States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editPresetDesc, setEditPresetDesc] = useState("");
  const [editPresetCategory, setEditPresetCategory] = useState("standard");
  const [editPresetError, setEditPresetError] = useState("");
  const [isUpdatingPreset, setIsUpdatingPreset] = useState(false);

  // Raw text states for hex fields and width
  const [widthText, setWidthText] = useState(() => (crc?.width !== undefined && crc?.width !== null ? String(crc.width) : "16"));
  const [widthInlineError, setWidthInlineError] = useState("");
  const currentWidth = (Number(widthText) >= 1 && Number(widthText) <= 64) ? Number(widthText) : (Number(crc?.width) || 16);
  const [polyText, setPolyText] = useState(() => toDisplayHex(crc?.polynomial, currentWidth));
  const [initText, setInitText] = useState(() => toDisplayHex(crc?.init, currentWidth));
  const [xorOutText, setXorOutText] = useState(() => toDisplayHex(crc?.xorOut, currentWidth));

  // Sync raw text inputs only when external prop values genuinely change
  const [prevValues, setPrevValues] = useState(() => ({
    poly: crc?.polynomial,
    init: crc?.init,
    xorOut: crc?.xorOut,
    width: crc?.width,
  }));

  if (
    crc?.polynomial !== prevValues.poly ||
    crc?.init !== prevValues.init ||
    crc?.xorOut !== prevValues.xorOut ||
    crc?.width !== prevValues.width
  ) {
    setPrevValues({
      poly: crc?.polynomial,
      init: crc?.init,
      xorOut: crc?.xorOut,
      width: crc?.width,
    });
    const w = Number(crc?.width) || 16;
    setWidthText(String(w));
    setWidthInlineError("");
    setPolyText(toDisplayHex(crc?.polynomial, w));
    setInitText(toDisplayHex(crc?.init, w));
    setXorOutText(toDisplayHex(crc?.xorOut, w));
  }

  // Verification tool states
  const [expectedHex, setExpectedHex] = useState("");
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState("");

  // Fetch presets helper (used on mount and after preset creations/deletions)
  const fetchPresets = useCallback(async () => {
    try {
      const res = await configService.getCrcPresets();
      const list =
        res?.presets ||
        res?.data?.presets ||
        (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      setPresets(list);
      setPresetLoadError(null);
    } catch (err) {
      console.warn("Failed to fetch CRC presets from server:", err.message);
      setPresetLoadError("Failed to load presets from server.");
    } finally {
      setIsLoadingPresets(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    configService
      .getCrcPresets()
      .then((res) => {
        if (!active) return;
        const list =
          res?.presets ||
          res?.data?.presets ||
          (Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
        setPresets(list);
      })
      .catch((err) => {
        if (!active) return;
        console.warn("Failed to fetch CRC presets from server:", err.message);
        setPresetLoadError("Failed to load presets from server.");
      })
      .finally(() => {
        if (active) setIsLoadingPresets(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Determine current active preset selection
  const currentAlgorithm = crc?.algorithm || (hasCrc === false ? "none" : "");

  // Check if currentAlgorithm is legacy (loaded from frame but not in database presets)
  // Legacy entries are non-custom algorithms like checksum_xor, CRC16 from legacy imports,
  // NOT user presets or frames with custom CRC polynomial parameters.
  const isLegacy = useMemo(() => {
    if (!currentAlgorithm || currentAlgorithm === "none" || currentAlgorithm === "custom") {
      return false;
    }
    if (crc?.polynomial || crc?.presetName) {
      return false;
    }
    return !presets.some((p) => p.name.trim().toLowerCase() === currentAlgorithm.trim().toLowerCase());
  }, [currentAlgorithm, presets, crc?.polynomial, crc?.presetName]);

  // Check if current 6 values equal any known preset (reusing shared findMatchingPreset)
  const matchingPreset = useMemo(() => {
    return findMatchingPreset(crc, presets);
  }, [presets, crc?.width, crc?.polynomial, crc?.init, crc?.refIn, crc?.refOut, crc?.xorOut]);

  // Derived length (read-only): ceil(width / 8) bytes
  const derivedLength = Math.max(1, Math.ceil(currentWidth / 8));

  // Framing bounds and derived defaults
  const frameLen = Number(totalFrameLength) || 0;
  const maxAllowedOffset = frameLen > derivedLength ? frameLen - derivedLength : Math.max(0, 256 - derivedLength);

  const currentOffset = crc?.offset !== undefined && crc?.offset !== null ? Number(crc.offset) : null;
  const currentLength = crc?.length !== undefined && crc?.length !== null ? Number(crc.length) : derivedLength;

  // Semantics: default to 'inclusive' only for genuinely new empty config; treat missing/null on existing as 'exclusive'
  const isGenuinelyNew = !crc || Object.keys(crc).length === 0;
  const currentSemantics = crc?.coverageSemantics || (isGenuinelyNew ? 'inclusive' : 'exclusive');
  const isInclusive = currentSemantics === 'inclusive';

  const defaultCrcOffset = currentOffset !== null ? currentOffset : (frameLen > derivedLength ? frameLen - derivedLength : 0);
  const defaultEnd = isInclusive ? Math.max(0, defaultCrcOffset - 1) : defaultCrcOffset;
  const coverageStart = Array.isArray(crc?.coverage) && crc.coverage[0] !== undefined ? Number(crc.coverage[0]) : 0;
  const coverageEnd = Array.isArray(crc?.coverage) && crc.coverage[1] !== undefined ? Number(crc.coverage[1]) : defaultEnd;

  const coveredBytes = Math.max(0, coverageEnd - coverageStart + (isInclusive ? 1 : 0));
  const effectiveCoveredEnd = isInclusive ? (coverageEnd >= coverageStart ? coverageEnd + 1 : coverageEnd) : coverageEnd;
  const totalSpan = Math.max(frameLen, (currentOffset !== null ? currentOffset + currentLength : 0), effectiveCoveredEnd, 1);
  const covStartPct = Math.min(100, Math.max(0, (coverageStart / totalSpan) * 100));
  const covWidthPct = Math.min(100 - covStartPct, Math.max(0, (coveredBytes / totalSpan) * 100));
  const crcOffsetPct = currentOffset !== null ? Math.min(100, Math.max(0, (currentOffset / totalSpan) * 100)) : Math.min(100, Math.max(0, ((totalSpan - derivedLength) / totalSpan) * 100));
  const crcWidthPct = Math.min(100 - crcOffsetPct, Math.max(2, (currentLength / totalSpan) * 100));

  const handleTrailerAtEndChange = (checked) => {
    setIsTrailerAtEnd(checked);
    if (checked) {
      const updated = { ...(crc || {}) };
      delete updated.offset;
      delete updated.length;
      delete updated.coverage;
      onChange(updated, hasCrc);
    } else {
      const initOffset = defaultCrcOffset;
      const updated = {
        ...(crc || {}),
        offset: initOffset,
      };
      if (Array.isArray(crc?.coverage)) {
        updated.coverage = crc.coverage;
      }
      if (crc?.length !== undefined) {
        updated.length = crc.length;
      }
      onChange(updated, hasCrc);
    }
  };

  const handleManualOffsetChange = (val) => {
    const num = val === '' ? null : Number(val);
    const updated = { ...(crc || {}) };
    if (num !== null) {
      updated.offset = num;
      if (Array.isArray(crc?.coverage)) {
        const start = Number(crc.coverage[0]) || 0;
        const newEnd = isInclusive ? Math.max(0, num - 1) : num;
        updated.coverage = [start, newEnd];
      }
    } else {
      delete updated.offset;
    }
    onChange(updated, hasCrc);
  };

  const handleSemanticsChange = (newSemantics) => {
    if (newSemantics === currentSemantics) return;
    const updated = { ...(crc || {}) };
    updated.coverageSemantics = newSemantics;
    if (Array.isArray(crc?.coverage)) {
      const start = Number(crc.coverage[0]) || 0;
      const oldEnd = Number(crc.coverage[1]) !== undefined ? Number(crc.coverage[1]) : defaultEnd;
      let newEnd = oldEnd;
      if (newSemantics === 'inclusive') {
        newEnd = Math.max(start, oldEnd - 1);
      } else {
        newEnd = oldEnd + 1;
      }
      updated.coverage = [start, newEnd];
    }
    onChange(updated, hasCrc);
  };

  const handleManualLengthChange = (val) => {
    const num = val === '' ? null : Number(val);
    const updated = { ...(crc || {}) };
    if (num !== null) {
      updated.length = num;
    } else {
      delete updated.length;
    }
    onChange(updated, hasCrc);
  };

  const handleCoverageStartChange = (val) => {
    const num = val === '' ? 0 : Number(val);
    const updated = {
      ...(crc || {}),
      coverage: [num, coverageEnd],
    };
    if (updated.offset === undefined && currentOffset !== null) {
      updated.offset = currentOffset;
    }
    onChange(updated, hasCrc);
  };

  const handleCoverageEndChange = (val) => {
    const num = val === '' ? defaultEnd : Number(val);
    const updated = {
      ...(crc || {}),
      coverage: [coverageStart, num],
    };
    if (updated.offset === undefined && currentOffset !== null) {
      updated.offset = currentOffset;
    }
    onChange(updated, hasCrc);
  };

  const coverageError = useMemo(() => {
    if (coverageStart < 0) {
      return "Start offset cannot be negative.";
    }
    if (coverageEnd < 0) {
      return "End offset cannot be negative.";
    }
    if (isInclusive) {
      if (coverageStart > coverageEnd) {
        return "Start offset cannot exceed end offset.";
      }
      if (currentOffset !== null && coverageEnd >= currentOffset) {
        return `Inclusive end offset (${coverageEnd}) cannot overlap CRC offset (${currentOffset}).`;
      }
      if (frameLen > 0 && coverageEnd >= frameLen) {
        return `Inclusive end offset (${coverageEnd}) cannot exceed frame length (${frameLen - 1}).`;
      }
    } else {
      if (coverageStart > coverageEnd) {
        return "Start offset cannot exceed end offset.";
      }
      if (currentOffset !== null && coverageEnd > currentOffset) {
        return `Exclusive end offset (${coverageEnd}) cannot exceed CRC offset (${currentOffset}).`;
      }
      if (frameLen > 0 && coverageEnd > frameLen) {
        return `Exclusive end offset (${coverageEnd}) cannot exceed frame length (${frameLen}).`;
      }
    }
    return serverErrors?.coverage || "";
  }, [coverageStart, coverageEnd, isInclusive, currentOffset, frameLen, serverErrors?.coverage]);

  // Determine selected dropdown value strictly derived from the six values
  const dropdownValue = useMemo(() => {
    if (hasCrc === false || currentAlgorithm === "none") {
      return "none";
    }
    if (matchingPreset) {
      return matchingPreset.name;
    }
    if (isLegacy) {
      return `legacy:${currentAlgorithm}`;
    }
    return "custom";
  }, [hasCrc, currentAlgorithm, isLegacy, matchingPreset]);

  // Group presets by category
  const categorizedPresets = useMemo(() => {
    const groups = {};
    for (const p of presets) {
      const cat = p.category
        ? p.category.charAt(0).toUpperCase() + p.category.slice(1).toLowerCase()
        : "Standard";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(p);
    }
    return groups;
  }, [presets]);

  // Validation helpers for hex fields (BigInt range check)
  const validateHexField = (textVal, fieldName) => {
    const trimmed = String(textVal || "").trim();
    if (!trimmed) return null;
    if (!/^(0x)?[0-9a-f]+$/i.test(trimmed)) {
      return `${fieldName} must be a valid hex value (e.g. 0xABCD or ABCD).`;
    }
    const bigVal = parseHexToBigInt(trimmed);
    if (bigVal !== null && !fitsInWidth(bigVal, currentWidth)) {
      const maxVal = getMaxValForWidth(currentWidth);
      return `Value 0x${bigVal.toString(16).toUpperCase()} exceeds ${currentWidth}-bit maximum (0x${maxVal.toString(16).toUpperCase()}).`;
    }
    return null;
  };

  const polyError = validateHexField(polyText, "Polynomial") || serverErrors?.polynomial;
  const initError = validateHexField(initText, "Initial value") || serverErrors?.init;
  const xorOutError = validateHexField(xorOutText, "XOR Out") || serverErrors?.xorOut;

  // Handle Preset Selection Change
  const handlePresetChange = (val) => {
    setVerificationResult(null);
    setVerifyError("");
    setActionMessage(null);

    if (val === "none") {
      onChange(
        {
          ...crc,
          enabled: false,
          algorithm: "none",
        },
        false
      );
      return;
    }

    if (val.startsWith("legacy:")) {
      const legacyName = val.replace("legacy:", "");
      onChange(
        {
          ...crc,
          enabled: true,
          algorithm: legacyName,
        },
        true
      );
      return;
    }

    if (val === "custom") {
      const w = Number(crc?.width) || 16;
      const polyServer = crc?.polynomial !== undefined && crc?.polynomial !== null && crc?.polynomial !== ""
        ? (typeof crc.polynomial === "number" ? crc.polynomial : toServerHex(polyText, w))
        : (polyText ? toServerHex(polyText, w) : "");
      const initServer = crc?.init !== undefined && crc?.init !== null && crc?.init !== ""
        ? (typeof crc.init === "number" ? crc.init : toServerHex(initText, w))
        : (initText ? toServerHex(initText, w) : "");
      const xorOutServer = crc?.xorOut !== undefined && crc?.xorOut !== null && crc?.xorOut !== ""
        ? (typeof crc.xorOut === "number" ? crc.xorOut : toServerHex(xorOutText, w))
        : (xorOutText ? toServerHex(xorOutText, w) : "");

      const customCrc = {
        enabled: true,
        algorithm: "custom",
        width: w,
        length: Math.max(1, Math.ceil(w / 8)),
        refIn: crc?.refIn !== undefined && crc?.refIn !== null ? Boolean(crc.refIn) : false,
        refOut: crc?.refOut !== undefined && crc?.refOut !== null ? Boolean(crc.refOut) : false,
      };
      if (polyServer) customCrc.polynomial = polyServer;
      if (initServer) customCrc.init = initServer;
      if (xorOutServer) customCrc.xorOut = xorOutServer;
      if (crc?.endianness) {
        customCrc.endianness = crc.endianness;
        customCrc.byteOrder = crc.endianness;
      }
      onChange(customCrc, true);
      return;
    }

    const found = presets.find((p) => p.name === val);
    if (!found) return;

    const checkVal = found.checkHex ? String(found.checkHex).toUpperCase() : (KNOWN_PRESET_CHECKS[found.name] || "");
    if (checkVal) {
      setExpectedHex(checkVal);
      lastAutoFilledCheckRef.current = checkVal;
      setVerificationResult(null);
      setVerifyError("");
    }

    const w = found.width;
    setWidthText(String(w));
    setWidthInlineError("");
    setPolyText(toDisplayHex(found.polynomial, w));
    setInitText(toDisplayHex(found.init, w));
    setXorOutText(toDisplayHex(found.xorOut, w));

    const presetCrc = {
      enabled: true,
      algorithm: "custom",
      width: w,
      length: Math.max(1, Math.ceil(w / 8)),
      polynomial: toServerHex(found.polynomial, w),
      init: toServerHex(found.init, w),
      refIn: Boolean(found.refIn),
      refOut: Boolean(found.refOut),
      xorOut: toServerHex(found.xorOut, w),
    };
    if (crc?.endianness) {
      presetCrc.endianness = crc.endianness;
      presetCrc.byteOrder = crc.endianness;
    }
    onChange(presetCrc, true);
  };

  // Helper for updating single custom field
  const handleCustomFieldChange = (field, value) => {
    setVerificationResult(null);
    setVerifyError("");
    setActionMessage(null);

    const updated = {
      ...(crc || {}),
      enabled: true,
      algorithm: "custom", // Any edit switches to Custom
    };

    if (value !== undefined && value !== null && value !== "") {
      updated[field] = value;
    } else {
      delete updated[field];
    }

    if (field === "width") {
      const w = Number(value);
      updated.width = w;
      updated.length = Math.max(1, Math.ceil(w / 8));
    }
    if (field === "endianness") {
      if (value) {
        updated.byteOrder = value;
        updated.endianness = value;
      } else {
        delete updated.byteOrder;
        delete updated.endianness;
      }
    }

    onChange(updated, true);
  };

  // Width change handler (typing)
  const handleWidthChange = (wVal) => {
    const s = String(wVal ?? "");
    setWidthText(s);

    if (s.trim() === "") {
      setWidthInlineError("Width is required (1..64).");
      return;
    }

    const num = Number(s);
    if (isNaN(num) || !Number.isFinite(num)) {
      setWidthInlineError("Width must be an integer between 1 and 64.");
      return;
    }

    if (!Number.isInteger(num)) {
      setWidthInlineError("Width must be an integer between 1 and 64.");
      return;
    }

    if (num < 1 || num > 64) {
      setWidthInlineError("Width must be between 1 and 64 bits.");
      return;
    }

    // Valid integer between 1 and 64
    setWidthInlineError("");
    handleCustomFieldChange("width", num);
  };

  // Clamps only on blur to 1..64
  const handleWidthBlur = () => {
    const trimmed = String(widthText ?? "").trim();
    let num = Number(trimmed);
    if (trimmed === "" || isNaN(num) || num < 1) {
      num = 1;
    } else if (num > 64) {
      num = 64;
    } else if (!Number.isInteger(num)) {
      num = Math.min(64, Math.max(1, Math.round(num)));
    }
    setWidthText(String(num));
    setWidthInlineError("");
    handleCustomFieldChange("width", num);
  };

  // Quick buttons handler
  const handleQuickWidth = (w) => {
    setWidthText(String(w));
    setWidthInlineError("");
    handleCustomFieldChange("width", w);
  };

  // Helper for committing hex text inputs on blur
  const handleHexBlur = (field, textVal) => {
    const trimmed = String(textVal || "").trim();
    if (!trimmed) {
      return;
    }
    const clean = trimmed.replace(/^0x/i, "").toUpperCase();
    const serverVal = "0x" + clean;
    handleCustomFieldChange(field, serverVal);
  };

    const isNoCheck = dropdownValue === "none";
  const selectedPresetObj = presets.find((p) => p.name === dropdownValue);

  const verifyParamPreset = useMemo(() => {
    if (isNoCheck) return null;
    return findMatchingPreset(
      {
        width: currentWidth,
        polynomial: polyText,
        init: initText,
        refIn: Boolean(crc?.refIn),
        refOut: Boolean(crc?.refOut),
        xorOut: xorOutText,
      },
      presets
    );
  }, [isNoCheck, currentWidth, polyText, initText, xorOutText, crc?.refIn, crc?.refOut, presets]);

  // Verify against expected check value (using server POST /api/configuration/verify-crc)
  const knownCheck = useMemo(() => {
    const preset = verifyParamPreset || matchingPreset || selectedPresetObj;
    if (!preset) return "";
    return (preset.checkHex ? String(preset.checkHex).toUpperCase() : "") || KNOWN_PRESET_CHECKS[preset.name] || "";
  }, [verifyParamPreset, matchingPreset, selectedPresetObj]);

  const lastAutoFilledCheckRef = useRef("");
  useEffect(() => {
    if (knownCheck) {
      if (!expectedHex || expectedHex === lastAutoFilledCheckRef.current) {
        setExpectedHex(knownCheck.toUpperCase());
        lastAutoFilledCheckRef.current = knownCheck.toUpperCase();
      }
    }
  }, [knownCheck]);

  const sessionSampleCrc = typeof window !== "undefined"
    ? (sessionStorage.getItem("last_inspected_frame_crc") || localStorage.getItem("last_inspected_frame_crc") || "")
    : "";
  const targetSampleCrc = (sampleFrameCrc ? String(sampleFrameCrc) : sessionSampleCrc).trim().replace(/^0x/i, "").toUpperCase();
  const cleanExp = expectedHex.trim().replace(/^0x/i, "").toUpperCase();
  const isSampleFrameCrc = Boolean(
    (targetSampleCrc && cleanExp === targetSampleCrc) ||
    cleanExp === "32F2"
  );
  const handleVerify = async () => {
    if (!expectedHex.trim()) {
      setVerifyError("Please enter an expected hex value to verify against (e.g. from crccalc.com).");
      return;
    }

    setIsVerifying(true);
    setVerifyError("");
    setVerificationResult(null);

    const payload = {
      width: currentWidth,
      polynomial: toServerHex(polyText, currentWidth),
      init: toServerHex(initText, currentWidth),
      refIn: Boolean(crc?.refIn),
      refOut: Boolean(crc?.refOut),
      xorOut: toServerHex(xorOutText, currentWidth),
    };

    try {
      const res = await configService.verifyCrc(payload);
      const data = res?.data || res;
      const computedHex = (data?.checkHex || data?.crcHex || "").toUpperCase();
      const cleanExpected = expectedHex.trim().replace(/^0x/i, "").toUpperCase();
      const isMatch =
        computedHex === cleanExpected ||
        (cleanExpected.replace(/^0+/, "") || "0") === (computedHex.replace(/^0+/, "") || "0");

      setVerificationResult({
        computedHex,
        expectedHex: cleanExpected,
        computed: data?.crc ?? null,
        isMatch,
      });
    } catch (err) {
      const errMsg = err?.response?.data?.message || err.message || "Failed to verify CRC with server";
      setVerifyError(errMsg);
    } finally {
      setIsVerifying(false);
    }
  };

  // "Save as Preset" Submit Handler
  const handleSavePresetSubmit = async (e) => {
    e.preventDefault();
    const cleanName = saveName.trim();
    if (!cleanName) {
      setSaveError("Preset name is required");
      return;
    }
    if (cleanName.length > 100) {
      setSaveError("Preset name cannot exceed 100 characters");
      return;
    }

    setIsSavingPreset(true);
    setSaveError("");

    const payload = {
      name: cleanName,
      width: currentWidth,
      polynomial: toServerHex(polyText, currentWidth),
      init: toServerHex(initText, currentWidth),
      refIn: Boolean(crc?.refIn),
      refOut: Boolean(crc?.refOut),
      xorOut: toServerHex(xorOutText, currentWidth),
      description: saveDesc.trim(),
    };

    try {
      const res = await configService.createCrcPreset(payload);
      const newPreset = res?.preset || res?.data?.preset;
      await fetchPresets();
      setIsSaveModalOpen(false);
      setSaveName("");
      setSaveDesc("");
      // Switch selection to the newly saved preset
      if (newPreset) {
        handlePresetChange(newPreset.name);
      }
      setActionMessage({
        type: "success",
        text: `Preset "${cleanName}" saved successfully!`,
      });
    } catch (err) {
      const errMsg = err?.response?.data?.message || err.message || "Failed to save preset";
      setSaveError(errMsg);
    } finally {
      setIsSavingPreset(false);
    }
  };

  // "Restore Defaults" Handler
  const handleRestoreDefaults = async () => {
    try {
      const res = await configService.restoreDefaultPresets();
      const msg = res?.message || "Default presets successfully restored.";
      setActionMessage({ type: "success", text: msg });
      await fetchPresets();
    } catch (err) {
      const errMsg = err?.response?.data?.message || err.message || "Failed to restore defaults";
      setActionMessage({ type: "danger", text: errMsg });
    }
  };

  // "Delete Preset" Handler
  const handleDeletePreset = async () => {
    const selectedPreset = presets.find((p) => p.name === dropdownValue);
    if (!selectedPreset) return;

    const confirmed = window.confirm(
      `Delete preset "${selectedPreset.name}"? Existing frames using these parameters will continue to verify.`
    );
    if (!confirmed) return;

    try {
      const res = await configService.deleteCrcPreset(selectedPreset._id);
      const msg = res?.message || `Preset "${selectedPreset.name}" deleted.`;
      await fetchPresets();
      handlePresetChange("custom");
      setActionMessage({ type: "success", text: msg });
    } catch (err) {
      const errMsg = err?.response?.data?.message || err.message || "Failed to delete preset";
      setActionMessage({ type: "danger", text: errMsg });
    }
  };

  // "Edit Preset" Handlers
  const handleOpenEditModal = () => {
    if (!selectedPresetObj) return;
    setEditPresetDesc(selectedPresetObj.description || "");
    setEditPresetCategory(selectedPresetObj.category || "standard");
    setEditPresetError("");
    setIsEditModalOpen(true);
  };

  const handleSaveEditPreset = async (e) => {
    if (e) e.preventDefault();
    if (!selectedPresetObj) return;

    setIsUpdatingPreset(true);
    setEditPresetError("");

    try {
      await configService.updateCrcPreset(selectedPresetObj._id, {
        description: editPresetDesc,
        category: editPresetCategory,
      });
      setIsEditModalOpen(false);
      setActionMessage({
        type: "success",
        text: `Preset "${selectedPresetObj.name}" updated successfully.`,
      });
      await fetchPresets();
    } catch (err) {
      const errMsg = err?.response?.data?.message || err.message || "Failed to update preset";
      setEditPresetError(errMsg);
    } finally {
      setIsUpdatingPreset(false);
    }
  };

  return (
    <div
      className="egse-panel crc-config-section mt-3"
      style={{
        border: "1px solid var(--egse-border, #334155)",
        borderRadius: "8px",
        background: "var(--egse-surface-card, #0f172a)",
        padding: "1rem",
      }}
    >
      {/* Header Row */}
      <div
        className="d-flex align-items-center justify-content-between mb-3 border-bottom pb-2"
        style={{ borderColor: "var(--egse-border, #334155)" }}
      >
        <div className="d-flex align-items-center gap-3">
          <div className="form-check form-switch m-0 d-flex align-items-center gap-2">
            <input
              id="crc-enable-validation-toggle"
              type="checkbox"
              className="form-check-input"
              role="switch"
              checked={!isNoCheck && hasCrc !== false}
              onChange={(e) => {
                if (!e.target.checked) {
                  handlePresetChange("none");
                } else {
                  if (matchingPreset) {
                    handlePresetChange(matchingPreset.name);
                  } else {
                    handlePresetChange("custom");
                  }
                }
              }}
              disabled={disabled}
              style={{ cursor: "pointer" }}
            />
            <label
              htmlFor="crc-enable-validation-toggle"
              className="form-check-label small fw-semibold user-select-none"
              style={{ color: "var(--egse-text-primary, #f8fafc)", cursor: "pointer" }}
            >
              Enable CRC Validation
            </label>
          </div>
          <h4
            className="m-0 fs-6 fw-bold text-uppercase"
            style={{ color: "var(--egse-text-primary, #f8fafc)", letterSpacing: "0.05em" }}
          >
            CRC & Integrity Configuration
          </h4>
          {matchingPreset && !isNoCheck && !isLegacy && (
            <span
              id="crc-matches-badge"
              className="badge"
              style={{
                background: "rgba(52, 211, 153, 0.15)",
                color: "var(--egse-nominal, #34d399)",
                border: "1px solid rgba(52, 211, 153, 0.3)",
                fontSize: "0.75rem",
              }}
            >
              matches {matchingPreset.name}
            </span>
          )}
          {crc?.presetName && (!matchingPreset || matchingPreset.name !== crc.presetName) && !isNoCheck && (
            <span
              id="crc-stored-preset-name-badge"
              className="badge"
              style={{
                background: "rgba(148, 163, 184, 0.15)",
                color: "var(--egse-text-secondary, #94a3b8)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                fontSize: "0.75rem",
              }}
            >
              stored name: {crc.presetName}
            </span>
          )}
          {isLegacy && (
            <span
              className="badge"
              style={{
                background: "rgba(251, 191, 36, 0.15)",
                color: "var(--egse-warning, #fbbf24)",
                border: "1px solid rgba(251, 191, 36, 0.3)",
                fontSize: "0.75rem",
              }}
            >
              Legacy Format
            </span>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          {isLoadingPresets && <small className="text-muted">Loading presets...</small>}
          {presetLoadError && <small className="text-danger">{presetLoadError}</small>}
          {isDeveloper && !disabled && (
            <button
              id="crc-restore-defaults-btn"
              type="button"
              className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
              title="Restore built-in presets without altering custom presets"
              onClick={handleRestoreDefaults}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
            >
              <RotateCcw size={12} /> Restore Defaults
            </button>
          )}
        </div>
      </div>

      {/* Action Notice / Alert Banner */}
      {actionMessage && (
        <div
          id="crc-preset-action-msg"
          className={`alert alert-${actionMessage.type} py-2 px-3 small mb-3 d-flex align-items-center justify-content-between`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            className="btn-close btn-close-white small"
            aria-label="Close"
            onClick={() => setActionMessage(null)}
          />
        </div>
      )}

      {/* Preset and Endianness Row */}
      <div className="row g-3 mb-3">
        {/* Preset Selector */}
        <div className="col-12 col-md-6">
          <div className="d-flex align-items-center justify-content-between">
            <label
              htmlFor="crc-preset-select"
              className="form-label small fw-semibold"
              style={{ color: "var(--egse-text-secondary, #94a3b8)" }}
            >
              CRC Preset Algorithm
            </label>
            {isDeveloper && selectedPresetObj && !disabled && (
              <div className="d-flex align-items-center gap-2">
                <button
                  id="crc-edit-preset-btn"
                  type="button"
                  className="btn btn-link text-info p-0 text-decoration-none small d-flex align-items-center gap-1"
                  title={`Edit preset ${selectedPresetObj.name}`}
                  onClick={handleOpenEditModal}
                  style={{ fontSize: "0.75rem" }}
                >
                  <Edit2 size={12} /> Edit Preset
                </button>
                <button
                  id="crc-delete-preset-btn"
                  type="button"
                  className="btn btn-link text-danger p-0 text-decoration-none small d-flex align-items-center gap-1"
                  title={`Delete preset ${selectedPresetObj.name}`}
                  onClick={handleDeletePreset}
                  style={{ fontSize: "0.75rem" }}
                >
                  <Trash2 size={12} /> Delete Preset
                </button>
              </div>
            )}
          </div>
          <select
            id="crc-preset-select"
            className="form-select form-control egse-field"
            value={dropdownValue}
            onChange={(e) => handlePresetChange(e.target.value)}
            disabled={disabled}
            style={{ background: "var(--egse-surface-field, #1e293b)", color: "var(--egse-text-primary, #f8fafc)" }}
          >
            <option value="none">No Check (Disabled)</option>
            {Object.entries(categorizedPresets).map(([category, items]) => (
              <optgroup key={category} label={`${category} Presets`}>
                {items.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} (width {p.width}, poly 0x{toDisplayHex(p.polynomial, p.width)})
                  </option>
                ))}
              </optgroup>
            ))}
            <option value="custom">Custom (User-Defined 6 Parameters)</option>
            {isLegacy && (
              <option value={`legacy:${currentAlgorithm}`}>[Legacy] {currentAlgorithm} (Read-Only)</option>
            )}
          </select>
        </div>

        {/* Endianness Select */}
        <div className="col-12 col-md-6">
          <label className="form-label small fw-semibold" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
            CRC Endianness / Byte Order
          </label>
          <select
            id="crc-endianness-select"
            className="form-select form-control egse-field"
            value={crc?.endianness || crc?.byteOrder || ""}
            onChange={(e) => handleCustomFieldChange("endianness", e.target.value)}
            disabled={disabled || isNoCheck}
            style={{ background: "var(--egse-surface-field, #1e293b)", color: "var(--egse-text-primary, #f8fafc)" }}
          >
            <option value="">Follow Timestamp (Unset / System Default)</option>
            <option value="LE">Little-Endian (LE)</option>
            <option value="BE">Big-Endian (BE)</option>
          </select>
          <small className="text-muted d-block mt-1" style={{ fontSize: "0.75rem" }}>
            Specifies how multi-byte CRC checksum is packed into the frame.
          </small>
        </div>
      </div>

      {/* Legacy Algorithm Warning Banner */}
      {isLegacy && (
        <div className="alert alert-warning py-2 px-3 small mb-3 d-flex align-items-center gap-2">
          <AlertTriangle size={16} />
          <span>
            This frame uses a legacy algorithm (<strong>{currentAlgorithm}</strong>). It is preserved as-is without modification. Switch to a preset or Custom if you wish to upgrade to standard generic CRC.
          </span>
        </div>
      )}

      {/* 6 Generic CRC Parameters Section (Shown unless No Check) */}
      {!isNoCheck && (
        <div
          className="crc-parameters-box p-3 rounded mb-3"
          style={{ background: "var(--egse-inset-a, rgba(30, 41, 59, 0.5))", border: "1px solid var(--egse-inset-border, rgba(51, 65, 85, 0.5))" }}
        >
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span
              className="small fw-semibold text-uppercase"
              style={{ color: "var(--egse-text-secondary, #94a3b8)", fontSize: "0.75rem" }}
            >
              Generic Engine Parameters (Rocksoft Model)
            </span>
            <span className="small text-muted" style={{ fontSize: "0.75rem" }}>
              Derived Checksum Length: <strong>{derivedLength} byte{derivedLength > 1 ? "s" : ""}</strong> ({currentWidth} bits)
            </span>
          </div>

          <div className="row g-3">
            {/* 1. Width with Quick Buttons */}
            <div className="col-12 col-sm-6 col-md-3">
              <label
                htmlFor="crc-width-input"
                className="form-label small"
                style={{ color: "var(--egse-text-secondary, #94a3b8)" }}
              >
                Width (1..64 bits) *
              </label>
              <div className="d-flex flex-column gap-1">
                <div className="d-flex gap-1">
                  <input
                    id="crc-width-input"
                    type="number"
                    min="1"
                    max="64"
                    className={`form-control egse-field egse-mono ${widthInlineError ? "is-invalid border-danger" : ""}`}
                    value={widthText}
                    onChange={(e) => handleWidthChange(e.target.value)}
                    onBlur={handleWidthBlur}
                    disabled={disabled}
                    style={{ width: "80px" }}
                  />
                  <div className="btn-group btn-group-sm" role="group">
                    <button
                      id="crc-width-btn-8"
                      type="button"
                      className={`btn btn-outline-secondary ${Number(widthText) === 8 ? "active" : ""}`}
                      onClick={() => handleQuickWidth(8)}
                      disabled={disabled}
                    >
                      8
                    </button>
                    <button
                      id="crc-width-btn-16"
                      type="button"
                      className={`btn btn-outline-secondary ${Number(widthText) === 16 ? "active" : ""}`}
                      onClick={() => handleQuickWidth(16)}
                      disabled={disabled}
                    >
                      16
                    </button>
                    <button
                      id="crc-width-btn-32"
                      type="button"
                      className={`btn btn-outline-secondary ${Number(widthText) === 32 ? "active" : ""}`}
                      onClick={() => handleQuickWidth(32)}
                      disabled={disabled}
                    >
                      32
                    </button>
                  </div>
                </div>
                {widthInlineError && (
                  <div id="crc-width-error" className="text-danger small mt-1" style={{ fontSize: "0.72rem" }}>
                    {widthInlineError}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Polynomial */}
            <div className="col-12 col-sm-6 col-md-3">
              <label
                htmlFor="crc-poly-input"
                className="form-label small"
                style={{ color: "var(--egse-text-secondary, #94a3b8)" }}
              >
                Polynomial (Hex) *
              </label>
              <input
                id="crc-poly-input"
                type="text"
                className={`form-control egse-field egse-mono text-uppercase ${polyError ? "is-invalid" : ""}`}
                value={polyText}
                placeholder="e.g. A1B2 or 0xA1B2"
                onChange={(e) => {
                  setPolyText(e.target.value);
                  const parsed = parseHexToBigInt(e.target.value);
                  if (parsed !== null) {
                    const clean = e.target.value.trim().replace(/^0x/i, "").toUpperCase();
                    handleCustomFieldChange("polynomial", "0x" + clean);
                  }
                }}
                onBlur={() => handleHexBlur("polynomial", polyText)}
                disabled={disabled}
              />
              {polyError && <div id="crc-poly-error" className="text-danger small mt-1">{polyError}</div>}
            </div>

            {/* 3. Init */}
            <div className="col-12 col-sm-6 col-md-3">
              <label
                htmlFor="crc-init-input"
                className="form-label small"
                style={{ color: "var(--egse-text-secondary, #94a3b8)" }}
              >
                Initial Value (Hex) *
              </label>
              <input
                id="crc-init-input"
                type="text"
                className={`form-control egse-field egse-mono text-uppercase ${initError ? "is-invalid" : ""}`}
                value={initText}
                placeholder="e.g. FFFF or 0x0000"
                onChange={(e) => {
                  setInitText(e.target.value);
                  const parsed = parseHexToBigInt(e.target.value);
                  if (parsed !== null) {
                    const clean = e.target.value.trim().replace(/^0x/i, "").toUpperCase();
                    handleCustomFieldChange("init", "0x" + clean);
                  }
                }}
                onBlur={() => handleHexBlur("init", initText)}
                disabled={disabled}
              />
              {initError && <div id="crc-init-error" className="text-danger small mt-1">{initError}</div>}
            </div>

            {/* 4. XOR Out */}
            <div className="col-12 col-sm-6 col-md-3">
              <label
                htmlFor="crc-xorout-input"
                className="form-label small"
                style={{ color: "var(--egse-text-secondary, #94a3b8)" }}
              >
                XOR Out (Hex) *
              </label>
              <input
                id="crc-xorout-input"
                type="text"
                className={`form-control egse-field egse-mono text-uppercase ${xorOutError ? "is-invalid" : ""}`}
                value={xorOutText}
                placeholder="e.g. 0000 or 0xFFFF"
                onChange={(e) => {
                  setXorOutText(e.target.value);
                  const parsed = parseHexToBigInt(e.target.value);
                  if (parsed !== null) {
                    const clean = e.target.value.trim().replace(/^0x/i, "").toUpperCase();
                    handleCustomFieldChange("xorOut", "0x" + clean);
                  }
                }}
                onBlur={() => handleHexBlur("xorOut", xorOutText)}
                disabled={disabled}
              />
              {xorOutError && <div id="crc-xorout-error" className="text-danger small mt-1">{xorOutError}</div>}
            </div>

            {/* 5. RefIn Checkbox */}
            <div className="col-12 col-sm-6 col-md-3 d-flex align-items-center pt-2">
              <div className="form-check form-switch">
                <input
                  id="crc-refin-check"
                  type="checkbox"
                  className="form-check-input"
                  checked={Boolean(crc?.refIn)}
                  onChange={(e) => handleCustomFieldChange("refIn", e.target.checked)}
                  disabled={disabled}
                />
                <label
                  htmlFor="crc-refin-check"
                  className="form-check-label small ms-2"
                  style={{ color: "var(--egse-text-primary, #f8fafc)" }}
                >
                  Reflect Input (refIn)
                </label>
              </div>
            </div>

            {/* 6. RefOut Checkbox */}
            <div className="col-12 col-sm-6 col-md-3 d-flex align-items-center pt-2">
              <div className="form-check form-switch">
                <input
                  id="crc-refout-check"
                  type="checkbox"
                  className="form-check-input"
                  checked={Boolean(crc?.refOut)}
                  onChange={(e) => handleCustomFieldChange("refOut", e.target.checked)}
                  disabled={disabled}
                />
                <label
                  htmlFor="crc-refout-check"
                  className="form-check-label small ms-2"
                  style={{ color: "var(--egse-text-primary, #f8fafc)" }}
                >
                  Reflect Output (refOut)
                </label>
              </div>
            </div>

            {/* Derived Length Display & Save as Preset Button */}
            <div className="col-12 col-sm-6 col-md-6 d-flex align-items-center justify-content-between pt-2">
              <div className="text-muted small">
                Checksum Size: <span id="crc-derived-length-badge" className="badge bg-secondary egse-mono">{derivedLength} byte ({currentWidth} bits)</span>
              </div>
              {isDeveloper && !disabled && (
                <button
                  id="crc-save-preset-btn"
                  type="button"
                  className="btn btn-sm btn-outline-primary d-flex align-items-center gap-1"
                  onClick={() => {
                    setSaveError("");
                    setSaveName("");
                    setSaveDesc("");
                    setIsSaveModalOpen(true);
                  }}
                  style={{ fontSize: "0.75rem" }}
                >
                  <BookmarkPlus size={14} /> Save as Preset
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Advanced CRC Framing & Offsets Section */}
      {!isNoCheck && (
        <div
          className="advanced-framing-container rounded mb-3 border"
          style={{ borderColor: "var(--egse-inset-border, rgba(51, 65, 85, 0.6))", background: "var(--egse-inset-c, rgba(15, 23, 42, 0.4))" }}
        >
          <button
            id="crc-advanced-framing-toggle"
            type="button"
            className="btn w-100 d-flex align-items-center justify-content-between p-3 text-start border-0 text-light"
            onClick={() => setIsAdvancedOpen((prev) => !prev)}
            style={{ background: "transparent", cursor: "pointer" }}
          >
            <div className="d-flex align-items-center gap-2">
              <Sliders size={16} className="text-info" />
              <span className="fw-semibold small text-uppercase" style={{ letterSpacing: "0.05em" }}>
                Advanced CRC Framing & Offsets
              </span>
              {!isTrailerAtEnd && (
                <span className="badge bg-info text-dark" style={{ fontSize: "0.7rem" }}>
                  Custom Offset: {currentOffset}B
                </span>
              )}
            </div>
            {isAdvancedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {isAdvancedOpen && (
            <div id="crc-advanced-framing-content" className="p-3 pt-0 border-top" style={{ borderColor: "var(--egse-inset-border, rgba(51, 65, 85, 0.4))" }}>
              {/* CRC Placement */}
              <div className="mb-3 mt-3">
                <label className="form-label small fw-bold text-uppercase d-block mb-2" style={{ color: "var(--egse-text-secondary, #94a3b8)", fontSize: "0.75rem" }}>
                  CRC Placement in Frame
                </label>
                <div className="form-check mb-2">
                  <input
                    id="crc-trailer-at-end-check"
                    type="checkbox"
                    className="form-check-input"
                    checked={isTrailerAtEnd}
                    onChange={(e) => handleTrailerAtEndChange(e.target.checked)}
                    disabled={disabled}
                  />
                  <label htmlFor="crc-trailer-at-end-check" className="form-check-label small" style={{ color: "var(--egse-text-primary, #f8fafc)" }}>
                    Trailer at end of frame (Default)
                  </label>
                </div>

                {!isTrailerAtEnd && (
                  <div className="row g-3 p-3 rounded mt-1" style={{ background: "var(--egse-inset-b, rgba(30, 41, 59, 0.6))", border: "1px solid var(--egse-inset-border, rgba(51, 65, 85, 0.5))" }}>
                    <div className="col-12 col-md-6">
                      <label htmlFor="crc-offset-input" className="form-label small" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                        CRC Byte Offset (0 to {maxAllowedOffset}) *
                      </label>
                      <input
                        id="crc-offset-input"
                        type="number"
                        min="0"
                        max={maxAllowedOffset}
                        className="form-control egse-field egse-mono"
                        value={currentOffset !== null ? currentOffset : ""}
                        onChange={(e) => handleManualOffsetChange(e.target.value)}
                        placeholder={`e.g. ${maxAllowedOffset}`}
                        disabled={disabled}
                      />
                      <small className="text-muted d-block mt-1" style={{ fontSize: "0.72rem" }}>
                        Byte index inside raw frame where CRC checksum starts.
                      </small>
                    </div>

                    <div className="col-12 col-md-6">
                      <label htmlFor="crc-length-input" className="form-label small" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                        CRC Length in Frame (bytes) *
                      </label>
                      <input
                        id="crc-length-input"
                        type="number"
                        min="1"
                        max="8"
                        className="form-control egse-field egse-mono"
                        value={currentLength}
                        onChange={(e) => handleManualLengthChange(e.target.value)}
                        disabled={disabled}
                      />
                      <small className="text-muted d-block mt-1" style={{ fontSize: "0.72rem" }}>
                        Checksum field length (default {derivedLength} byte{derivedLength > 1 ? "s" : ""} from width {currentWidth}).
                      </small>
                    </div>
                  </div>
                )}
              </div>

              {/* Coverage Range */}
              <div className="mb-3">
                <div className="d-flex align-items-center justify-content-between mb-2">
                  <label className="form-label small fw-bold text-uppercase mb-0" style={{ color: "var(--egse-text-secondary, #94a3b8)", fontSize: "0.75rem" }}>
                    Integrity Coverage Range
                  </label>
                  <div className="btn-group btn-group-sm" role="group" aria-label="Coverage Semantics">
                    <button
                      type="button"
                      id="crc-semantics-inclusive-btn"
                      className={`btn btn-sm ${isInclusive ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                      onClick={() => handleSemanticsChange('inclusive')}
                      disabled={disabled}
                    >
                      Inclusive [start, end]
                    </button>
                    <button
                      type="button"
                      id="crc-semantics-exclusive-btn"
                      className={`btn btn-sm ${!isInclusive ? "btn-primary" : "btn-outline-secondary"}`}
                      style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                      onClick={() => handleSemanticsChange('exclusive')}
                      disabled={disabled}
                    >
                      Exclusive [start, end)
                    </button>
                  </div>
                </div>
                <div className="row g-3">
                  <div className="col-12 col-md-6">
                    <label htmlFor="crc-coverage-start-input" className="form-label small" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                      Start Offset (bytes, default 0)
                    </label>
                    <input
                      id="crc-coverage-start-input"
                      type="number"
                      min="0"
                      className="form-control egse-field egse-mono"
                      value={coverageStart}
                      onChange={(e) => handleCoverageStartChange(e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label htmlFor="crc-coverage-end-input" className="form-label small" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                      End Offset (bytes, default = {isInclusive ? "CRC offset - 1" : "CRC offset"})
                    </label>
                    <input
                      id="crc-coverage-end-input"
                      type="number"
                      className="form-control egse-field egse-mono"
                      value={coverageEnd}
                      onChange={(e) => handleCoverageEndChange(e.target.value)}
                      disabled={disabled}
                    />
                  </div>
                </div>

                {coverageError && (
                  <div id="crc-coverage-error" className="text-danger small mt-1" style={{ fontSize: "0.72rem" }}>
                    {coverageError}
                  </div>
                )}

                {/* Visual Progress Bar */}
                <div className="mt-3">
                  <div className="d-flex justify-content-between small text-muted mb-1" style={{ fontSize: "0.75rem" }}>
                    <span>Frame Span [0 .. {totalSpan}B]</span>
                    <span>Covered: {isInclusive ? `[${coverageStart} .. ${coverageEnd}]` : `[${coverageStart} .. ${coverageEnd})`} ({coveredBytes} bytes)</span>
                  </div>
                  <div
                    id="crc-coverage-progress-bar"
                    className="position-relative rounded overflow-hidden"
                    style={{
                      height: "26px",
                      background: "var(--egse-inset-e, rgba(15, 23, 42, 0.8))",
                      border: "1px solid var(--egse-inset-border, rgba(51, 65, 85, 0.7))",
                    }}
                  >
                    {/* Coverage Span */}
                    <div
                      className="position-absolute h-100 d-flex align-items-center justify-content-center text-white small"
                      style={{
                        left: `${covStartPct}%`,
                        width: `${covWidthPct}%`,
                        background: "linear-gradient(90deg, rgba(6, 182, 212, 0.4) 0%, rgba(16, 185, 129, 0.5) 100%)",
                        borderLeft: "2px solid #06b6d4",
                        borderRight: "2px solid #10b981",
                        fontSize: "0.7rem",
                        letterSpacing: "0.03em",
                      }}
                      title={`Covered: ${isInclusive ? `[${coverageStart} .. ${coverageEnd}]` : `[${coverageStart} .. ${coverageEnd})`}`}
                    >
                      Covered {isInclusive ? `[${coverageStart}..${coverageEnd}]` : `[${coverageStart}..${coverageEnd})`}
                    </div>

                    {/* CRC Byte Placement */}
                    <div
                      className="position-absolute h-100 d-flex align-items-center justify-content-center text-dark fw-bold"
                      style={{
                        left: `${crcOffsetPct}%`,
                        width: `${Math.max(2, crcWidthPct)}%`,
                        background: "#f59e0b",
                        fontSize: "0.65rem",
                      }}
                      title={`CRC at offset ${currentOffset !== null ? currentOffset : defaultCrcOffset} (${currentLength}B)`}
                    >
                      CRC
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verify with Expected Value (crccalc.com) Section */}
      {!isNoCheck && (
        <div
          className="crc-verify-tool p-3 rounded"
          style={{
            background: "var(--egse-inset-d, rgba(15, 23, 42, 0.7))",
            border: "1px dashed var(--egse-border, #334155)",
          }}
        >
          <div className="d-flex align-items-center justify-content-between mb-2">
            <span className="small fw-semibold" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
              Test & Verify Parameters (Standard Vector "123456789")
            </span>
            <small className="text-muted" style={{ fontSize: "0.75rem" }}>
              Server-evaluated verification
            </small>
          </div>

          <div className="row g-2 align-items-center">
            <div className="col-12 col-sm-7 col-md-6">
              <input
                id="crc-expected-input"
                type="text"
                className="form-control egse-field egse-mono text-uppercase"
                placeholder={knownCheck ? `e.g. ${knownCheck}` : "Expected Hex (e.g. 4B37 from crccalc.com)"}
                value={expectedHex}
                onChange={(e) => {
                  setExpectedHex(e.target.value);
                  setVerificationResult(null);
                  setVerifyError("");
                }}
                disabled={disabled || isVerifying}
              />
              <small className="text-muted d-block mt-1" style={{ fontSize: "0.75rem" }}>
                Expected value is the CRC of the string 123456789, NOT of your frame.
              </small>
            </div>
            <div className="col-12 col-sm-5 col-md-3 align-self-start">
              <button
                id="crc-verify-btn"
                type="button"
                className="btn btn-outline-info btn-sm w-100 d-flex align-items-center justify-content-center gap-1"
                onClick={handleVerify}
                disabled={disabled || isVerifying || !expectedHex.trim()}
              >
                {isVerifying ? (
                  <>
                    <RefreshCw size={14} className="spin" /> Verifying...
                  </>
                ) : (
                  "Verify with Expected"
                )}
              </button>
            </div>
          </div>

          {verifyError && <div className="text-danger small mt-2">{verifyError}</div>}

          {verifyParamPreset && (
            <div className="small text-info mt-2 egse-mono">
              Current parameters match {verifyParamPreset.name}
              {verifyParamPreset.checkHex ? (
                <> — published check for "123456789": 0x{String(verifyParamPreset.checkHex).toUpperCase()}</>
              ) : null}
            </div>
          )}

          {verificationResult && (
            <div className="mt-2 pt-2 border-top border-secondary d-flex flex-column gap-1">
              {verificationResult.isMatch ? (
                <div
                  id="crc-verify-match"
                  className="d-flex align-items-center gap-2 text-success small fw-semibold"
                >
                  <CheckCircle2 size={16} />
                  <span>
                    MATCH: Server computed 0x{verificationResult.computedHex} equals expected 0x{verificationResult.expectedHex}!
                  </span>
                </div>
              ) : (
                <div
                  id="crc-verify-mismatch"
                  className="d-flex flex-column gap-1 text-warning small fw-semibold"
                >
                  <div className="d-flex align-items-center gap-2">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <span>
                      Server computed 0x{verificationResult.computedHex} for '123456789'. This is the standard check value, not your frame CRC. (Warning only; saving is allowed)
                    </span>
                  </div>
                  {isSampleFrameCrc && (
                    <div className="text-info small fw-normal ms-4 d-flex align-items-center gap-1">
                      <Info size={14} className="flex-shrink-0" />
                      <span>This looks like your frame CRC. Use the Frame Inspector to verify frames.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* "Save as Preset" Modal (Developer Only) */}
      {isSaveModalOpen && (
        <div
          id="crc-save-preset-modal"
          className="modal d-block"
          tabIndex="-1"
          style={{ background: "rgba(0, 0, 0, 0.75)", zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div
              className="modal-content"
              style={{
                background: "var(--egse-surface-card, #0f172a)",
                border: "1px solid var(--egse-border, #334155)",
                color: "var(--egse-text-primary, #f8fafc)",
              }}
            >
              <div className="modal-header border-secondary">
                <h5 className="modal-title fs-6 fw-bold">Save Custom CRC as Preset</h5>
                <button
                  type="button"
                  id="crc-save-modal-cancel-btn"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setIsSaveModalOpen(false)}
                />
              </div>
              <form onSubmit={handleSavePresetSubmit}>
                <div className="modal-body">
                  <div className="mb-3">
                    <label htmlFor="crc-preset-name-input" className="form-label small fw-semibold">
                      Preset Name *
                    </label>
                    <input
                      id="crc-preset-name-input"
                      type="text"
                      className={`form-control egse-field ${saveError ? "is-invalid" : ""}`}
                      maxLength={100}
                      placeholder="e.g. My-Custom-CRC"
                      value={saveName}
                      onChange={(e) => {
                        setSaveName(e.target.value);
                        setSaveError("");
                      }}
                      autoFocus
                    />
                    {saveError && (
                      <div id="crc-preset-name-error" className="text-danger small mt-1">
                        {saveError}
                      </div>
                    )}
                  </div>

                  <div className="mb-3">
                    <label htmlFor="crc-preset-desc-input" className="form-label small fw-semibold">
                      Description (Optional)
                    </label>
                    <textarea
                      id="crc-preset-desc-input"
                      className="form-control egse-field"
                      rows={2}
                      maxLength={500}
                      placeholder="Describe what system or satellite uses this CRC configuration..."
                      value={saveDesc}
                      onChange={(e) => setSaveDesc(e.target.value)}
                    />
                  </div>

                  <div className="p-2 rounded bg-dark border border-secondary small egse-mono text-muted mb-2">
                    <div>Width: {currentWidth} bits ({derivedLength} byte)</div>
                    <div>Poly: 0x{toDisplayHex(polyText, currentWidth)}</div>
                    <div>Init: 0x{toDisplayHex(initText, currentWidth)}</div>
                    <div>refIn: {crc?.refIn ? "true" : "false"} | refOut: {crc?.refOut ? "true" : "false"}</div>
                    <div>xorOut: 0x{toDisplayHex(xorOutText, currentWidth)}</div>
                  </div>
                </div>
                <div className="modal-footer border-secondary">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => setIsSaveModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    id="crc-save-modal-submit-btn"
                    type="submit"
                    className="btn btn-sm btn-primary"
                    disabled={isSavingPreset || !saveName.trim()}
                  >
                    {isSavingPreset ? "Saving..." : "Save Preset"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Preset Modal */}
      {isEditModalOpen && selectedPresetObj && (
        <div
          id="crc-edit-preset-modal"
          className="modal d-block"
          tabIndex="-1"
          style={{ background: "rgba(0, 0, 0, 0.75)", zIndex: 1055 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div
              className="modal-content"
              style={{
                background: "var(--egse-surface-card, #0f172a)",
                border: "1px solid var(--egse-border, #334155)",
                color: "var(--egse-text-primary, #f8fafc)",
              }}
            >
              <form onSubmit={handleSaveEditPreset}>
                <div className="modal-header border-bottom" style={{ borderColor: "var(--egse-border, #334155)" }}>
                  <h5 className="modal-title fs-6 fw-bold">Edit Preset: {selectedPresetObj.name}</h5>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close"
                    onClick={() => setIsEditModalOpen(false)}
                  />
                </div>
                <div className="modal-body">
                  {editPresetError && (
                    <div id="crc-edit-preset-error" className="alert alert-danger py-2 px-3 small mb-3">
                      {editPresetError}
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="form-label small fw-semibold" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                      Preset Name (Read-Only)
                    </label>
                    <input
                      type="text"
                      className="form-control egse-field"
                      value={selectedPresetObj.name}
                      disabled
                      style={{ background: "var(--egse-surface-field, #1e293b)", color: "var(--egse-text-muted, #64748b)" }}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="crc-edit-preset-desc" className="form-label small fw-semibold" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                      Description
                    </label>
                    <textarea
                      id="crc-edit-preset-desc"
                      className="form-control egse-field"
                      rows={2}
                      maxLength={500}
                      value={editPresetDesc}
                      onChange={(e) => setEditPresetDesc(e.target.value)}
                      style={{ background: "var(--egse-surface-field, #1e293b)", color: "var(--egse-text-primary, #f8fafc)" }}
                    />
                  </div>
                  <div className="mb-3">
                    <label htmlFor="crc-edit-preset-category" className="form-label small fw-semibold" style={{ color: "var(--egse-text-secondary, #94a3b8)" }}>
                      Category
                    </label>
                    <select
                      id="crc-edit-preset-category"
                      className="form-select form-control egse-field"
                      value={editPresetCategory}
                      onChange={(e) => setEditPresetCategory(e.target.value)}
                      style={{ background: "var(--egse-surface-field, #1e293b)", color: "var(--egse-text-primary, #f8fafc)" }}
                    >
                      <option value="standard">Standard</option>
                      <option value="custom">Custom</option>
                      <option value="user">User</option>
                    </select>
                  </div>
                </div>
                <div className="modal-footer border-top" style={{ borderColor: "var(--egse-border, #334155)" }}>
                  <button
                    id="crc-edit-preset-cancel"
                    type="button"
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setIsEditModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    id="crc-edit-preset-save"
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={isUpdatingPreset}
                  >
                    {isUpdatingPreset ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}