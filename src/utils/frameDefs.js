// Turns a user-defined frame's parameter rows (from the Add Frame page) into
// the parameter definitions the Live Telemetry screen renders/simulates.

const num = (v) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

export function deriveParameterDefs(parameters = []) {
  return parameters
    .filter((p) => p.name)
    .map((p) => {
      const parameterId = p._id ? String(p._id) : (p.parameterId ? String(p.parameterId) : (p.id && p.id !== p.name ? String(p.id) : undefined));
      if (String(p.unit).toLowerCase() === "enum") {
        return {
          id: p.name,
          name: p.name,
          ...(parameterId ? { parameterId } : {}),
          label: p.name,
          icon: "🏷️",
          kind: "enum",
          options: [{ value: 0, label: "state_0" }, { value: 1, label: "state_1" }, { value: 2, label: "state_2" }],
        };
      }
      const wl = num(p.warnLow), wh = num(p.warnHigh), al = num(p.alarmLow), ah = num(p.alarmHigh);
      const limits = {};
      if (al !== null) limits.alarmLow = al;
      if (wl !== null) limits.warnLow = wl;
      if (wh !== null) limits.warnHigh = wh;
      if (ah !== null) limits.alarmHigh = ah;

      let base = 10; // demo value only — real values come from decoded frames
      if (wl !== null && wh !== null) base = (wl + wh) / 2;
      else if (wh !== null) base = wh - Math.abs(wh) * 0.4;
      else if (wl !== null) base = wl + (Math.abs(wl) || 1) * 0.4;

      return {
        id: p.name,
        name: p.name,
        ...(parameterId ? { parameterId } : {}),
        label: p.name,
        icon: "📌",
        kind: "numeric",
        unit: p.unit || "",
        base,
        jitter: Math.max(0.1, Math.abs(base) * 0.04),
        limits,
      };
    });
}
