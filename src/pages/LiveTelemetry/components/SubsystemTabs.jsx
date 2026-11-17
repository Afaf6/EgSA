export default function SubsystemTabs({ subsystems = [], active, onChange }) {
  const uniqueSubs = Array.from(
    new Set((subsystems || []).map((s) => (typeof s === "string" ? s : s?.name || s?.subsystemCode || String(s))))
  ).filter(Boolean);

  return (
    <div className="d-flex gap-2 flex-wrap">
      {uniqueSubs.map((id, idx) => (
        <button
          key={`${id}-${idx}`}
          className={`btn btn-sm ${active === id ? "btn-egse-primary" : "btn-egse-outline"}`}
          onClick={() => onChange(id)}
        >
          {id}
        </button>
      ))}
    </div>
  );
}
