import { useEffect, useMemo, useState } from "react";

export default function ParameterPicker({ parameters = [], onAddGraph }) {
  const safeParams = Array.isArray(parameters) ? parameters : [];
  const subsystems = [...new Set(safeParams.map((parameter) => parameter.subsystem).filter(Boolean))];
  const [subsystem, setSubsystem] = useState(subsystems[0]);
  const numericParams = useMemo(
    () => parameters.filter((parameter) => parameter.subsystem === subsystem),
    [parameters, subsystem]
  );
  const [paramId, setParamId] = useState(numericParams[0]?.key);

  useEffect(() => {
    if (!subsystems.includes(subsystem)) setSubsystem(subsystems[0]);
  }, [subsystem, subsystems]);

  useEffect(() => {
    if (!numericParams.some((parameter) => parameter.key === paramId)) setParamId(numericParams[0]?.key);
  }, [numericParams, paramId]);

  const handleSubsystemChange = (value) => {
    setSubsystem(value);
    const first = parameters.find((parameter) => parameter.subsystem === value);
    setParamId(first?.key);
  };

  return (
    <div className="egse-panel mb-3">
      <div className="egse-panel-body d-flex flex-wrap align-items-end gap-2">
        <div>
          <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
            Subsystem
          </label>
          <select
            className="form-select form-select-sm egse-field"
            value={subsystem}
            onChange={(e) => handleSubsystemChange(e.target.value)}
          >
            {subsystems.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label small" style={{ color: "var(--egse-text-secondary)" }}>
            Parameter
          </label>
          <select
            className="form-select form-select-sm egse-field"
            style={{ minWidth: 220 }}
            value={paramId}
            onChange={(e) => setParamId(e.target.value)}
          >
            {numericParams.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} ({p.unit || "no unit"}) · {p.frameName}
              </option>
            ))}
          </select>
        </div>

        <button
          className="btn btn-sm btn-egse-primary"
          disabled={!paramId}
          onClick={() => {
            const parameter = numericParams.find((item) => item.key === paramId);
            if (parameter) onAddGraph(parameter);
          }}
        >
          📈 Add Graph
        </button>
      </div>
    </div>
  );
}
