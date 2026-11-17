import { formatDateTime } from "../../../utils/formatters";

function FeedPanel({ title, icon, items, emptyText, renderItem }) {
  return (
    <div className="egse-panel h-100">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">
          {icon} {title}
        </h3>
        <span className="egse-chip egse-chip-neutral">{items.length}</span>
      </div>
      <div className="egse-panel-body d-flex flex-column gap-2" style={{ maxHeight: 320, overflowY: "auto" }}>
        {items.length === 0 && (
          <div className="small" style={{ color: "var(--egse-text-muted)" }}>
            {emptyText}
          </div>
        )}
        {items.map(renderItem)}
      </div>
    </div>
  );
}

export default function ProcessingFeed({ files, frames, errors }) {
  return (
    <div className="row g-3">
      <div className="col-lg-4">
        <FeedPanel
          title="New TLM Files"
          icon="📄"
          items={files}
          emptyText="No new files detected yet."
          renderItem={(f) => (
            <div key={f.id} className="d-flex justify-content-between small egse-mono">
              <span>{f.fileName}</span>
              <span style={{ color: "var(--egse-text-muted)" }}>
                {(f.sizeBytes / 1024).toFixed(1)} KB · {formatDateTime(f.detectedAt)}
              </span>
            </div>
          )}
        />
      </div>

      <div className="col-lg-4">
        <FeedPanel
          title="Detected / New Frames"
          icon="🧩"
          items={frames}
          emptyText="No frames decoded yet."
          renderItem={(f, i) => (
            <div key={i} className="d-flex justify-content-between small">
              <span className="egse-chip egse-chip-raw">{f.frameName}</span>
              <span style={{ color: "var(--egse-text-muted)" }}>
                {f.packetsDecoded} pkts · {formatDateTime(f.detectedAt)}
              </span>
            </div>
          )}
        />
      </div>

      <div className="col-lg-4">
        <FeedPanel
          title="Processing Errors"
          icon="⚠️"
          items={errors}
          emptyText="No processing errors."
          renderItem={(e, i) => (
            <div key={i} className="d-flex align-items-start gap-2 small">
              <span className="egse-dot egse-dot-alarm mt-1" />
              <span>
                {e.message}
                <div style={{ color: "var(--egse-text-muted)", fontSize: "0.75rem" }}>{formatDateTime(e.detectedAt)}</div>
              </span>
            </div>
          )}
        />
      </div>
    </div>
  );
}
