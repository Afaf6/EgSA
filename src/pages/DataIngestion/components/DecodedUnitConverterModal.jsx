import { useState, useMemo, useEffect } from "react";
import {
  UNIT_CATEGORIES,
  ALL_STANDARD_UNITS,
  findUnitCategory,
  getCompatibleUnits,
  convertValue,
  getConversionFactors,
  normalizeUnit,
} from "../../../utils/unitConversion";
import {
  ArrowRightLeft,
  Zap,
  Check,
  X,
  RotateCcw,
  Sliders,
  Scale,
  ShieldCheck,
} from "lucide-react";

export default function DecodedUnitConverterModal({
  isOpen,
  onClose,
  parameters = [],
  unitOverrides = {},
  onUpdateUnitOverride,
  onApplyOverride,
  onResetAllOverrides,
  onResetOverrides,
  sampleRecord = null,
  initialParamKey = null,
}) {
  if (!isOpen) return null;

  return (
    <DecodedUnitConverterModalContent
      onClose={onClose}
      parameters={parameters}
      unitOverrides={unitOverrides}
      onUpdateUnitOverride={onUpdateUnitOverride}
      onApplyOverride={onApplyOverride}
      onResetAllOverrides={onResetAllOverrides}
      onResetOverrides={onResetOverrides}
      sampleRecord={sampleRecord}
      initialParamKey={initialParamKey}
    />
  );
}

function DecodedUnitConverterModalContent({
  onClose,
  parameters,
  unitOverrides,
  onUpdateUnitOverride,
  onApplyOverride,
  onResetAllOverrides,
  onResetOverrides,
  sampleRecord,
  initialParamKey,
}) {
  // Selected parameter in the frame
  const [selectedParamKey, setSelectedParamKey] = useState(() => {
    if (initialParamKey) return initialParamKey;
    if (parameters.length > 0) return parameters[0]._id || parameters[0].id || parameters[0].name;
    return "";
  });

  useEffect(() => {
    if (initialParamKey) {
      setSelectedParamKey(initialParamKey);
    }
  }, [initialParamKey]);

  const selectedParam = useMemo(() => {
    return parameters.find(
      (p) => (p._id || p.id || p.name) === selectedParamKey || p.name === selectedParamKey
    ) || parameters[0] || null;
  }, [parameters, selectedParamKey]);

  const originalUnit = selectedParam?.unit || "";
  const activeOverride = selectedParamKey ? unitOverrides[selectedParamKey] : null;
  const currentDisplayUnit = activeOverride || originalUnit;

  const detectedCategory = useMemo(() => {
    return findUnitCategory(originalUnit) || findUnitCategory(currentDisplayUnit) || "voltage";
  }, [originalUnit, currentDisplayUnit]);

  const [selectedCategory, setSelectedCategory] = useState(detectedCategory);

  useEffect(() => {
    setSelectedCategory(detectedCategory);
  }, [detectedCategory]);

  const compatibleUnits = useMemo(() => {
    const list = getCompatibleUnits(originalUnit);
    if (list.length > 0) return list;
    return UNIT_CATEGORIES[selectedCategory]?.units || [];
  }, [originalUnit, selectedCategory]);

  const [targetUnit, setTargetUnit] = useState(() => {
    if (activeOverride) return activeOverride;
    const firstOther = compatibleUnits.find((u) => u.id !== originalUnit);
    return firstOther ? firstOther.id : originalUnit;
  });

  useEffect(() => {
    if (activeOverride) {
      setTargetUnit(activeOverride);
    } else {
      const firstOther = compatibleUnits.find((u) => u.id !== originalUnit);
      setTargetUnit(firstOther ? firstOther.id : originalUnit);
    }
  }, [selectedParamKey, activeOverride, compatibleUnits, originalUnit]);

  // Sample reading value from selectedRecord if available
  const sampleValue = useMemo(() => {
    if (sampleRecord && Array.isArray(sampleRecord.readings) && selectedParam) {
      const pId = selectedParam._id || selectedParam.id;
      const r = sampleRecord.readings.find(
        (rd) =>
          (rd.parameterId && (rd.parameterId === pId || String(rd.parameterId) === String(pId))) ||
          (rd.parameterName && rd.parameterName === selectedParam.name)
      );
      if (r && (r.engineeringValue !== undefined || r.value !== undefined)) {
        return r.engineeringValue !== undefined ? r.engineeringValue : r.value;
      }
    }
    return 10.0;
  }, [sampleRecord, selectedParam]);

  const [customTestVal, setCustomTestVal] = useState(String(sampleValue));

  useEffect(() => {
    setCustomTestVal(String(sampleValue));
  }, [sampleValue]);

  // Live conversion preview
  const convertedResult = useMemo(() => {
    const val = Number(customTestVal);
    if (isNaN(val)) return "—";
    const res = convertValue(val, originalUnit, targetUnit);
    return res !== null ? parseFloat(res.toPrecision(7)) : "—";
  }, [customTestVal, originalUnit, targetUnit]);

  const factors = useMemo(() => {
    return getConversionFactors(originalUnit, targetUnit);
  }, [originalUnit, targetUnit]);

  const handleApply = () => {
    const applyFn = onApplyOverride || onUpdateUnitOverride;
    if (selectedParamKey && applyFn) {
      applyFn(selectedParamKey, targetUnit);
    }
    if (onClose) {
      onClose();
    }
  };

  const handleResetCurrent = () => {
    const applyFn = onApplyOverride || onUpdateUnitOverride;
    if (selectedParamKey && applyFn) {
      applyFn(selectedParamKey, originalUnit);
    }
  };

  const activeOverridesCount = Object.keys(unitOverrides).filter(
    (k) => unitOverrides[k] && unitOverrides[k] !== parameters.find((p) => (p._id || p.id || p.name) === k)?.unit
  ).length;

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.75)", zIndex: 1060 }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div
          className="modal-content text-light shadow-lg border"
          style={{
            backgroundColor: "var(--egse-bg-panel, #121824)",
            borderColor: "var(--egse-border-soft, #2a3447)",
          }}
        >
          {/* Header */}
          <div
            className="modal-header d-flex align-items-center justify-content-between p-3"
            style={{ borderBottom: "1px solid var(--egse-border-soft, #2a3447)" }}
          >
            <div className="d-flex align-items-center gap-2">
              <div
                className="p-2 rounded d-flex align-items-center justify-content-center"
                style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "var(--egse-raw, #06b6d4)" }}
              >
                <ArrowRightLeft size={18} />
              </div>
              <div>
                <h5 className="modal-title h6 mb-0 fw-bold">
                  Decoded Telemetry Unit Converter & Display Options
                </h5>
                <span className="small text-muted" style={{ fontSize: "0.78rem" }}>
                  Convert decoded telemetry readings to other units in real time
                </span>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={onClose}
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="modal-body p-4 d-flex flex-column gap-4">
            {/* Step 1: Select Telemetry Parameter to Convert */}
            <div>
              <label className="form-label small fw-bold text-uppercase tracking-wider text-muted mb-2 d-flex align-items-center justify-content-between">
                <span>1 · Choose Telemetry Parameter:</span>
                {activeOverridesCount > 0 && (
                  <span className="badge bg-info bg-opacity-20 text-info border border-info border-opacity-30">
                    {activeOverridesCount} parameters actively converted
                  </span>
                )}
              </label>

              <select
                className="form-select egse-field font-monospace"
                value={selectedParamKey}
                onChange={(e) => setSelectedParamKey(e.target.value)}
              >
                {parameters.map((p) => {
                  const key = p._id || p.id || p.name;
                  const override = unitOverrides[key];
                  const hasOverride = override && override !== p.unit;
                  return (
                    <option key={key} value={key}>
                      {p.name} · Default: [{p.unit || "None"}]{" "}
                      {hasOverride ? `➔ Active: [${override}]` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Step 2: Dimension & Target Unit */}
            <div
              className="p-3 rounded border"
              style={{
                backgroundColor: "rgba(6, 182, 212, 0.04)",
                borderColor: "rgba(6, 182, 212, 0.2)",
              }}
            >
              <div className="row g-3 align-items-center">
                {/* Native Original Unit */}
                <div className="col-12 col-md-5">
                  <label className="form-label small text-muted mb-1">
                    Original Ingested Unit:
                  </label>
                  <div className="p-2 rounded border bg-dark font-monospace text-center fs-6 text-warning">
                    {originalUnit ? `[${originalUnit}]` : "(None)"}
                  </div>
                </div>

                {/* Arrow */}
                <div className="col-12 col-md-2 text-center pt-md-3">
                  <div
                    className="d-inline-flex p-2 rounded-circle"
                    style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "var(--egse-raw)" }}
                  >
                    <ArrowRightLeft size={18} />
                  </div>
                </div>

                {/* Target Unit Selector */}
                <div className="col-12 col-md-5">
                  <label className="form-label small text-muted mb-1">
                    Display Unit:
                  </label>
                  <select
                    className="form-select egse-field font-monospace"
                    value={targetUnit}
                    onChange={(e) => setTargetUnit(e.target.value)}
                  >
                    {compatibleUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label} {u.id === originalUnit ? "— (Original Default)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Conversion Factor & Live Formula */}
              <div className="mt-3 pt-3 border-top border-secondary d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-2 small">
                  <Zap size={15} className="text-warning" />
                  <span className="text-muted">Formula Ratio:</span>
                  <span className="fw-bold font-monospace text-info">
                    1 {originalUnit} = {convertValue(1, originalUnit, targetUnit)} {targetUnit}
                  </span>
                </div>

                {/* Interactive Sensor Reading Conversion Preview */}
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Test reading:</span>
                  <input
                    type="number"
                    className="form-control form-control-sm egse-field font-monospace text-center"
                    style={{ width: "95px" }}
                    value={customTestVal}
                    onChange={(e) => setCustomTestVal(e.target.value)}
                  />
                  <span className="font-monospace small text-muted">[{originalUnit}] =</span>
                  <span
                    className="badge bg-dark border border-info text-info font-monospace py-2 px-2"
                    style={{ fontSize: "0.85rem" }}
                  >
                    {convertedResult} [{targetUnit}]
                  </span>
                </div>
              </div>
            </div>

            {/* Information Notice */}
            <div
              className="p-3 rounded small d-flex align-items-start gap-2 text-muted"
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.02)",
                border: "1px solid var(--egse-border-soft, #2a3447)",
              }}
            >
              <ShieldCheck size={16} className="text-info flex-shrink-0 mt-0-5" />
              <div>
                <strong>Non-Destructive Live Conversion:</strong> Raw database telemetry records remain safe and untouched in their authentic raw/calibrated engineering values. Changing the display unit converts readings on the fly across the spreadsheet matrix, record inspector, and charts.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="modal-footer d-flex flex-wrap justify-content-between p-3 gap-2"
            style={{ borderTop: "1px solid var(--egse-border-soft, #2a3447)" }}
          >
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleResetCurrent}
                disabled={!activeOverride || activeOverride === originalUnit}
                title="Reset this parameter back to its original native unit"
              >
                <RotateCcw size={13} className="me-1" />
                <span>Reset Parameter</span>
              </button>

              {activeOverridesCount > 0 && onResetAllOverrides && (
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning"
                  onClick={onResetAllOverrides}
                  title="Reset all converted parameters in this frame back to defaults"
                >
                  <RotateCcw size={13} className="me-1" />
                  <span>Reset All ({activeOverridesCount})</span>
                </button>
              )}
            </div>

            <div className="d-flex align-items-center gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary px-3" onClick={onClose}>
                Close
              </button>
              <button
                type="button"
                className="btn btn-sm btn-info text-dark fw-bold px-4 d-inline-flex align-items-center gap-2"
                onClick={handleApply}
              >
                <Check size={16} />
                <span>Apply Display Unit</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
