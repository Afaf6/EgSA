import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";

function TreeNode({ node, depth, onSelect, selectedId, onAddChild, onDelete, canAddChild }) {
  const [expanded, setExpanded] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const hasChildren = node.children && node.children.length > 0;

  const submitAdd = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newLabel.trim()) return;
    onAddChild(node.id, newLabel.trim());
    setNewLabel("");
    setAdding(false);
    setExpanded(true);
  };

  return (
    <div>
      <div
        className="d-flex align-items-center gap-2 py-1 px-2 small rounded"
        style={{
          paddingInlineStart: depth * 16 + 8,
          color: selectedId === node.id ? "var(--egse-raw)" : "var(--egse-text-primary)",
          background: selectedId === node.id ? "rgba(6,182,212,0.08)" : "transparent",
        }}
      >
        <span
          role="button"
          className="d-flex align-items-center gap-2 flex-grow-1"
          onClick={() => {
            if (hasChildren) setExpanded((e) => !e);
            onSelect(node);
          }}
        >
          {hasChildren && <span style={{ width: 10 }}>{expanded ? "▾" : "▸"}</span>}
          <span>{node.icon}</span>
          <span className={node.leaf ? "egse-mono" : ""}>{node.label}</span>
          {node.addedInVersion && (
            <span
              className="badge rounded-pill ms-1"
              style={{
                fontSize: "0.68rem",
                padding: "2px 6px",
                background: "rgba(16, 185, 129, 0.15)",
                color: "#10b981",
                border: "1px solid rgba(16, 185, 129, 0.3)",
              }}
              title={`Added in version ${node.addedInVersion}`}
            >
              v{node.addedInVersion}
            </span>
          )}
        </span>

        {canAddChild(node) && (
          <button
            type="button"
            className="btn btn-sm p-0 px-1"
            style={{ color: "var(--egse-text-muted)", background: "none", border: "none" }}
            title="Add child"
            onClick={(e) => {
              e.stopPropagation();
              setAdding((a) => !a);
            }}
          >
            <Plus size={13} />
          </button>
        )}
        {depth > 0 && (
          <button
            type="button"
            className="btn btn-sm p-0 px-1"
            style={{ color: "var(--egse-alarm)", background: "none", border: "none" }}
            title="Delete"
            aria-label={`Delete ${node.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(node.id);
            }}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>

      {adding && (
        <form
          onSubmit={submitAdd}
          className="d-flex gap-1 px-2 mb-1"
          style={{ paddingInlineStart: (depth + 1) * 16 + 8 }}
        >
          <input
            autoFocus
            className="form-control form-control-sm egse-field"
            placeholder="New name…"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <button type="submit" className="btn btn-sm btn-egse-primary">
            Add
          </button>
        </form>
      )}

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onAddChild={onAddChild}
              onDelete={onDelete}
              canAddChild={canAddChild}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Backend endpoints to wire up:
//   POST /api/config/subsystems   { projectId, name }
//   POST /api/config/frames       { subsystemId, name }
//   DELETE /api/config/nodes/:id
export default function HierarchyTree({ tree, onSelect, selectedId, onAddChild, onDelete }) {
  // Root (project) and subsystem nodes (depth 0/1) can have children added;
  // frame leaves (depth 2) cannot.
  const canAddChild = (node) => !node.leaf;

  return (
    <div className="egse-panel">
      <div className="egse-panel-header">
        <h3 className="egse-panel-title">Hierarchy</h3>
      </div>
      <div className="egse-panel-body">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            onSelect={onSelect}
            selectedId={selectedId}
            onAddChild={onAddChild}
            onDelete={onDelete}
            canAddChild={canAddChild}
          />
        ))}
      </div>
    </div>
  );
}
