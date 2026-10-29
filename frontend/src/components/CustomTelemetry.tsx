import { useState } from "react";
import { api } from "@/services/api";
import { useAO02Store } from "@/store/ao02Store";

export function CustomTelemetry() {
  const { state, actions } = useAO02Store();
  const [file, setFile] = useState<File | null>(null);
  const [capacity, setCapacity] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function upload() {
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("CSV must be smaller than 10 MB.");
      if (!file.size) throw new Error("The selected file is empty.");
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file.");
      const storageCapacity = capacity ? Number(capacity) : undefined;
      if (storageCapacity !== undefined && (!Number.isFinite(storageCapacity) || storageCapacity <= 0)) throw new Error("Enter a positive storage capacity in TB.");
      const result = await api.uploadTelemetry(file, storageCapacity);
      if (state.telemetryWindow) {
        const { rackId, tenantId, resourceType } = state.telemetryWindow;
        await actions.loadTelemetry({ rackId, tenantId, resourceType });
      }
      await actions.refreshAll(true);
      setMessage(`Imported ${result.points} readings. Scan complete: ${result.tokens_minted} new tokens queued. ${(result.warnings ?? []).join(" ")}`);
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Upload failed. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="custom-telemetry panel mt-6">
      <summary>Custom telemetry <span className="text-brand-muted">Upload CSV</span></summary>
      <div className="telemetry-upload">
        <p>Upload a CSV to scan resources and queue incidents. <a className="link" href="/telemetry-example.csv" download>Example CSV ↗</a></p>
        <div className="telemetry-upload-controls">
          <label>Telemetry CSV <input type="file" accept=".csv,text/csv" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setMessage(""); }} /></label>
          <label>Storage capacity (TB, optional)<input type="number" min="0" step="any" value={capacity} disabled={busy} onChange={event => setCapacity(event.target.value)} placeholder="e.g. 100" className="border p-2" /></label>
          <button type="button" className="btn btn-primary" disabled={!file || busy} onClick={() => void upload()}>{busy ? "Importing & scanning…" : "Upload & scan CSV"}</button>
        </div>
        {message && <p className="upload-feedback" role={failed ? "alert" : "status"}>{message}</p>}
      </div>
    </details>
  );
}
