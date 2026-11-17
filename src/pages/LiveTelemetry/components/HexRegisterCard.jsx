import { useState } from "react";
import { formatHex } from "../../../utils/formatters";

/** Breaks a 32-bit register into its individual bits for the popover viewer. */
function BitMaskViewer({ value }) {
  const bits = Array.from({ length: 32 }, (_, i) => 31 - i).map((bitIdx) => ({
    bitIdx,
    set: ((value >>> bitIdx) & 1) === 1,
  }));

  return (
    <div className="egse-panel p-2 mt-2" style={{ background: "var(--egse-bg-deep)" }}>
      <div className="d-flex flex-wrap gap-1 egse-mono" style={{ fontSize: "0.7rem" }}>
        {bits.map((b) => (
          <div
            key={b.bitIdx}
            className="text-center"
            style={{
              width: 26,
              padding: "2px 0",
              borderRadius: 4,
              background: b.set ? "var(--egse-nominal-bg)" : "rgba(255,255,255,0.03)",
              color: b.set ? "var(--egse-nominal)" : "var(--egse-text-muted)",
              border: `1px solid ${b.set ? "rgba(16,185,129,0.35)" : "var(--egse-border-soft)"}`,
            }}
          >
            {b.bitIdx}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HexRegisterCard({ value, bytes = 4 }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        className="egse-param-hex btn btn-link p-0 text-decoration-none"
        onClick={() => setOpen((o) => !o)}
        title="Click to open the Bit-Mask Viewer"
      >
        {formatHex(value, bytes)}
      </button>
      {open && <BitMaskViewer value={value} />}
    </div>
  );
}
