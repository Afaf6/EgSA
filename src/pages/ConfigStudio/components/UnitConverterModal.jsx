import { useState, useMemo } from "react";
import {
  UNIT_CATEGORIES,
  ALL_STANDARD_UNITS,
  findUnitCategory,
  convertValue,
  getConversionFactors,
  convertParameterRow,
  normalizeUnit,
} from "../../../utils/unitConversion";
import {
  ArrowRightLeft,
  Calculator,
  Sliders,
  Check,
  X,
  Zap,
  Info,
  CheckCircle2,
} from "lucide-react";

export default function UnitConverterModal({
  isOpen,
  onClose,
  parameterRow,
  onApplyConversion,
}) {
  if (!isOpen) return null;

  return (
    <UnitConverterModalContent
      onClose={onClose}
      parameterRow={parameterRow}
      onApplyConversion={onApplyConversion}
    />
  );
}

function UnitConverterModalContent({
  onClose,
  parameterRow,
  onApplyConversion,
}) {
  const currentUnit = parameterRow?.unit || "";
  const detectedCategory = useMemo(() => findUnitCategory(currentUnit) || "voltage", [currentUnit]);

  const [selectedCategory, setSelectedCategory] = useState(detectedCategory);
  const [fromUnit, setFromUnit] = useState(normalizeUnit(currentUnit) || UNIT_CATEGORIES[detectedCategory]?.baseUnit || "V");
  const [toUnit, setToUnit] = useState(() => {
    const cat = UNIT_CATEGORIES[detectedCategory];
    const firstOther = cat?.units.find((u) => u.id !== fromUnit);
    return firstOther ? firstOther.id : cat?.baseUnit || "mV";
  });

  const [sampleValue, setSampleValue] = useState("1");
  const [applyToScale, setApplyToScale] = useState(true);
  const [applyToLimits, setApplyToLimits] = useState(true);

  // Category change handler
  const handleCategoryChange = (newCat) => {
    setSelectedCategory(newCat);
    const catObj = UNIT_CATEGORIES[newCat];
    if (catObj && catObj.units.length > 0) {
      setFromUnit(catObj.units[0].id);
      setToUnit(catObj.units[1] ? catObj.units[1].id : catObj.units[0].id);
    }
  };

  // Conversion math
  const factors = useMemo(() => getConversionFactors(fromUnit, toUnit), [fromUnit, toUnit]);
  const convertedSample = useMemo(() => {
    const res = convertValue(sampleValue, fromUnit, toUnit);
    return res !== null ? parseFloat(res.toPrecision(7)) : "—";
  }, [sampleValue, fromUnit, toUnit]);

  // Preview updated parameter values
  const previewRow = useMemo(() => {
    if (!parameterRow) return null;
    return convertParameterRow(
      parameterRow,
      toUnit,
      { updateScale: applyToScale, updateLimits: applyToLimits }
    );
  }, [parameterRow, toUnit, applyToScale, applyToLimits]);

  const handleApply = () => {
    if (previewRow && onApplyConversion) {
      onApplyConversion(previewRow);
      onClose();
    }
  };

  const currentUnitsList = UNIT_CATEGORIES[selectedCategory]?.units || [];

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
                  Unit Conversion & Recalibration Assistant
                </h5>
                <span className="small text-muted" style={{ fontSize: "0.78rem" }}>
                  Convert units and recalibrate processing parameters and limits
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
            {/* Active Parameter Summary */}
            {parameterRow && (
              <div
                className="p-3 rounded border d-flex flex-wrap align-items-center justify-content-between gap-3"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  borderColor: "var(--egse-border-soft, #2a3447)",
                }}
              >
                <div>
                  <div className="text-muted small text-uppercase tracking-wider" style={{ fontSize: "0.7rem" }}>
                    Selected Parameter
                  </div>
                  <div className="fw-bold fs-6 text-info font-monospace">
                    {parameterRow.name || "Parameter"}
                  </div>
                </div>
                <div className="d-flex align-items-center gap-3 font-monospace small">
                  <div>
                    <span className="text-muted">Current Unit: </span>
                    <span className="badge bg-dark border border-secondary text-warning">
                      {parameterRow.unit || "None"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Scale: </span>
                    <span className="text-light">{parameterRow.scale ?? 1}</span>
                  </div>
                  <div>
                    <span className="text-muted">Offset: </span>
                    <span className="text-light">{parameterRow.offset ?? 0}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: Category Selection */}
            <div>
              <label className="form-label small fw-bold text-uppercase tracking-wider text-muted mb-2">
                1 · Dimension / Category
              </label>
              <div className="d-flex flex-wrap gap-2">
                {Object.values(UNIT_CATEGORIES).map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    className={`btn btn-sm ${
                      selectedCategory === cat.key
                        ? "btn-info text-dark fw-bold"
                        : "btn-outline-secondary text-light"
                    }`}
                    style={{ fontSize: "0.78rem" }}
                    onClick={() => handleCategoryChange(cat.key)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Step 2: From & To Units with Conversion Formula */}
            <div
              className="p-3 rounded border"
              style={{
                backgroundColor: "rgba(6, 182, 212, 0.04)",
                borderColor: "rgba(6, 182, 212, 0.2)",
              }}
            >
              <div className="row g-3 align-items-center">
                {/* From Unit */}
                <div className="col-12 col-md-5">
                  <label className="form-label small text-muted mb-1">
                    Convert From:
                  </label>
                  <select
                    className="form-select form-select-sm egse-field font-monospace"
                    value={fromUnit}
                    onChange={(e) => setFromUnit(e.target.value)}
                  >
                    {currentUnitsList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Arrow */}
                <div className="col-12 col-md-2 text-center pt-md-4">
                  <div
                    className="d-inline-flex p-2 rounded-circle"
                    style={{ backgroundColor: "rgba(6, 182, 212, 0.15)", color: "var(--egse-raw)" }}
                  >
                    <ArrowRightLeft size={18} />
                  </div>
                </div>

                {/* To Unit */}
                <div className="col-12 col-md-5">
                  <label className="form-label small text-muted mb-1">
                    Convert To:
                  </label>
                  <select
                    className="form-select form-select-sm egse-field font-monospace"
                    value={toUnit}
                    onChange={(e) => setToUnit(e.target.value)}
                  >
                    {currentUnitsList.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Formula & Live Calculation Preview */}
              <div className="mt-3 pt-3 border-top border-secondary d-flex flex-wrap align-items-center justify-content-between gap-3">
                <div className="d-flex align-items-center gap-2 small">
                  <Zap size={15} className="text-warning" />
                  <span className="text-muted">Conversion Ratio:</span>
                  <span className="fw-bold font-monospace text-info">
                    1 {fromUnit} = {convertValue(1, fromUnit, toUnit)} {toUnit}
                  </span>
                </div>

                {/* Interactive Sample Value Tester */}
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-muted">Test value:</span>
                  <input
                    type="number"
                    className="form-control form-control-sm egse-field font-monospace text-center"
                    style={{ width: "90px" }}
                    value={sampleValue}
                    onChange={(e) => setSampleValue(e.target.value)}
                  />
                  <span className="font-monospace small text-muted">{fromUnit} =</span>
                  <span className="badge bg-dark border border-info text-info font-monospace py-2 px-2" style={{ fontSize: "0.85rem" }}>
                    {convertedSample} {toUnit}
                  </span>
                </div>
              </div>
            </div>

            {/* Step 3: Application Options */}
            {parameterRow && (
              <div>
                <label className="form-label small fw-bold text-uppercase tracking-wider text-muted mb-2">
                  2 · Automatic Recalibration Options
                </label>
                <div className="d-flex flex-column gap-2">
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="opt-scale"
                      checked={applyToScale}
                      onChange={(e) => setApplyToScale(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="opt-scale">
                      <strong>Auto-recalibrate Scale & Offset:</strong> Automatically adjust the scale multiplier and offset constant so physical sensor conversion stays accurate.
                    </label>
                    {applyToScale && previewRow && parameterRow.equation && (
                      <div className="text-muted font-monospace mt-1 ms-4" style={{ fontSize: "0.75rem" }}>
                        Equation: {parameterRow.equation} ➔ <span className="text-info">{previewRow.equation}</span>
                      </div>
                    )}
                    {applyToScale && previewRow && !parameterRow.equation && (
                      <div className="text-muted font-monospace mt-1 ms-4" style={{ fontSize: "0.75rem" }}>
                        Scale: {parameterRow.scale ?? 1} ➔ <span className="text-info">{previewRow.scale}</span> | Offset: {parameterRow.offset ?? 0} ➔ <span className="text-info">{previewRow.offset}</span>
                      </div>
                    )}
                  </div>

                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="opt-limits"
                      checked={applyToLimits}
                      onChange={(e) => setApplyToLimits(e.target.checked)}
                    />
                    <label className="form-check-label small" htmlFor="opt-limits">
                      <strong>Convert Alarm & Warning Limits:</strong> Automatically convert numeric threshold limits (Warn Low/High, Alarm Low/High) to the new unit.
                    </label>
                    {applyToLimits && previewRow && (parameterRow.warnLow || parameterRow.warnHigh || parameterRow.alarmLow || parameterRow.alarmHigh) && (
                      <div className="text-muted font-monospace mt-1 ms-4 d-flex flex-wrap gap-2" style={{ fontSize: "0.75rem" }}>
                        {parameterRow.warnLow && <span>WarnLow: {previewRow.warnLow} {toUnit}</span>}
                        {parameterRow.warnHigh && <span>WarnHigh: {previewRow.warnHigh} {toUnit}</span>}
                        {parameterRow.alarmLow && <span>AlarmLow: {previewRow.alarmLow} {toUnit}</span>}
                        {parameterRow.alarmHigh && <span>AlarmHigh: {previewRow.alarmHigh} {toUnit}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div
            className="modal-footer d-flex justify-content-between p-3"
            style={{ borderTop: "1px solid var(--egse-border-soft, #2a3447)" }}
          >
            <button type="button" className="btn btn-sm btn-outline-secondary px-3" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-sm btn-info text-dark fw-bold px-4 d-inline-flex align-items-center gap-2"
              onClick={handleApply}
              disabled={fromUnit === toUnit && parameterRow?.unit === toUnit}
            >
              <Check size={16} />
              <span>Apply Conversion to Parameter</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
