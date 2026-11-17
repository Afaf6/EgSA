import ConfigExportCard from "./components/ConfigExportCard";

export default function ExportCenterPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="egse-heading h4 mb-1">Mission Export & Reports Center</h1>
        <p className="small mb-0" style={{ color: "var(--egse-text-secondary)" }}>
          Export project configuration schemas and mission definition files (JSON)
        </p>
      </div>

      <div className="row g-4 justify-content-center">
        <div className="col-lg-8 col-xl-7">
          <ConfigExportCard />
        </div>
      </div>
    </div>
  );
}
