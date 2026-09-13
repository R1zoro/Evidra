import { useState } from 'react';
import { Icon, getFileIcon } from './Icon';
import { ResultEmpty } from './UI';
import type { Finding } from '../types';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';
export function Results({
  response,
  onBookmarkFinding,
}: {
  response: RuntimeExecutionResponse | null;
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  const results = response?.results ?? [];
  const currentResult =
    results.find((r) => r.id === selectedResultId) ??
    results[results.length - 1];

  return (
    <aside className="results-pane">
      {results.length > 0 && (
        <div className="results-step-selector">
          <div className="step-selector-title">OPERATIONS ({results.length}):</div>
          <div className="step-chips-scroll">
            {results.map((res, idx) => {
              const step = response?.steps.find((s) => s.operation_id === res.operation_id);
              const isSelected = currentResult?.id === res.id;
              return (
                <button
                  key={res.id}
                  className={`step-chip ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedResultId(res.id)}
                  title={`${step?.capability ?? res.operation_id} -> ${res.type}`}
                >
                  <span className="step-num">0{idx + 1}</span>
                  <span className="step-cap">{step?.capability ?? res.operation_id}</span>
                  <span className="step-type-pill">{res.type.replace("Collection", "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {currentResult ? (
        <ResultCard
          key={currentResult.id}
          result={currentResult}
          context={response?.context}
          onBookmarkFinding={onBookmarkFinding}
        />
      ) : (
        <ResultEmpty />
      )}
    </aside>
  );
}



export function ResultCard({
  result,
  context,
  onBookmarkFinding,
}: {
  result: RuntimeExecutionResponse["results"][number];
  context?: RuntimeExecutionResponse["context"];
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [tab, setTab] = useState<"structured" | "raw">("structured");
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 1800);
  };

  return (
    <div className="result-card">
      <header>
        <div>
          <small>RESULTS EXPLORER</small>
          <strong>{result.type} · {result.id}</strong>
        </div>
        <div className="result-header-actions">
          <span className={`badge ${result.status}`}>{result.status}</span>
          <button className="btn-bookmark" title="Bookmark as Finding" onClick={() => onBookmarkFinding(result)}>
            <Icon name="bookmark" /> Bookmark
          </button>
        </div>
      </header>

      <nav>
        <button className={tab === "structured" ? "active" : ""} onClick={() => setTab("structured")}>
          Structured View
        </button>
        <button className={tab === "raw" ? "active" : ""} onClick={() => setTab("raw")}>
          Raw JSON
        </button>
      </nav>

      {tab === "raw" ? (
        <pre className="result-pre">{JSON.stringify(result.value, null, 2)}</pre>
      ) : (
        <div className="result-content-body">
          {renderSpecializedResult(result, copyToClipboard, copiedHash)}
        </div>
      )}

      <footer>
        <span>Source: {context?.source_reference ?? "EVID-001"}</span>
        <span>Op: {result.operation_id ?? "n/a"}</span>
      </footer>
    </div>
  );
}

function renderSpecializedResult(
  result: RuntimeExecutionResponse["results"][number],
  copyToClipboard: (text: string) => void,
  copiedHash: string | null
) {
  const { type, value } = result;

  // 1. ArtifactCollection Renderer
  if (type === "ArtifactCollection" && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      name: string;
      relative_path: string;
      extension: string;
      size_bytes: number;
      modified_at: string;
      sha256: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Total Artifacts: <strong>{items.length}</strong></span>
          <span>
            Total Size: <strong>{(items.reduce((acc, i) => acc + (i.size_bytes || 0), 0) / 1024).toFixed(1)} KB</strong>
          </span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Artifact</th>
                <th>Path</th>
                <th>Type</th>
                <th>Size</th>
                <th>Modified (UTC)</th>
                <th>SHA-256</th>
              </tr>
            </thead>
            <tbody>
              {items.map((art) => (
                <tr key={art.id}>
                  <td>
                    <div className="art-name-cell">
                      <Icon name={getFileIcon(art.name, "file")} />
                      <strong>{art.name}</strong>
                    </div>
                  </td>
                  <td><code className="path-code">{art.relative_path}</code></td>
                  <td><span className="ext-badge">{art.extension || "none"}</span></td>
                  <td>{art.size_bytes < 1024 ? `${art.size_bytes} B` : `${(art.size_bytes / 1024).toFixed(1)} KB`}</td>
                  <td><small className="mono-time">{art.modified_at ? art.modified_at.replace("T", " ").replace("Z", "") : "-"}</small></td>
                  <td>
                    <button
                      className="hash-copy-btn"
                      title={art.sha256}
                      onClick={() => copyToClipboard(art.sha256)}
                    >
                      <code>{art.sha256 ? `${art.sha256.slice(0, 10)}...` : "-"}</code>
                      <small>{copiedHash === art.sha256 ? "Copied" : "Copy"}</small>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 2. MetadataCollection Renderer
  if (type === "MetadataCollection" && Array.isArray(value)) {
    const records = value as Array<{
      id: string;
      artifact_id: string;
      common: { name: string; path: string; size: number; type: string };
      filesystem: { modified_at: string; read_only: boolean };
      namespaces: {
        archive?: {
          entries_count?: number;
          entries?: Array<{ name: string; size: number; compressed_size: number; is_dir: boolean }>;
          suspicious_members?: string[];
          is_encrypted?: boolean;
          error?: string;
        };
        image?: { format: string; width: number; height: number; aspect_ratio: string };
        binary?: { format: string; platform: string; architecture?: string; magic?: string };
        text?: { line_count?: number; preview?: string; error?: string };
        tabular?: { columns?: string[]; row_count?: number };
      };
    }>;

    return (
      <div className="specialized-metadata-view">
        {records.map((rec) => (
          <div className="meta-card" key={rec.id}>
            <div className="meta-card-header">
              <div className="meta-card-title">
                <Icon name={getFileIcon(rec.common.name, "file")} />
                <strong>{rec.common.name}</strong>
                <span className="meta-id-tag">{rec.artifact_id}</span>
              </div>
              <div className="meta-card-badges">
                <span className="ext-badge">{rec.common.type}</span>
                <span className="badge completed">READ-ONLY</span>
              </div>
            </div>

            <div className="meta-details-grid">
              <div><small>Path:</small> <code>{rec.common.path}</code></div>
              <div><small>Size:</small> <strong>{rec.common.size} bytes</strong></div>
              <div><small>Modified:</small> <span>{rec.filesystem.modified_at}</span></div>
            </div>

            {/* Archive Namespace */}
            {rec.namespaces.archive && (
              <div className="namespace-section archive-section">
                <div className="namespace-header">
                  <Icon name="archive" />
                  <strong>Archive Deep Inspection ({rec.namespaces.archive.entries_count ?? 0} members)</strong>
                  {rec.namespaces.archive.is_encrypted && <span className="badge failed">ENCRYPTED</span>}
                </div>
                {rec.namespaces.archive.suspicious_members && rec.namespaces.archive.suspicious_members.length > 0 && (
                  <div className="suspicious-alert"><span className="alert-icon">⚠️</span> <strong>High-Risk Members:</strong> {rec.namespaces.archive.suspicious_members.join(", ")}
                  </div>
                )}
                {rec.namespaces.archive.entries && rec.namespaces.archive.entries.length > 0 && (
                  <div className="archive-entries-list">
                    {rec.namespaces.archive.entries.map((ent, idx) => (
                      <div className="archive-entry-item" key={idx}>
                        <span><Icon name={ent.is_dir ? "folder" : "file"} /> {ent.name}</span>
                        <small>{ent.size} bytes</small>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Image Namespace */}
            {rec.namespaces.image && (
              <div className="namespace-section image-section">
                <div className="namespace-header">
                  <Icon name="file" />
                  <strong>Image Metadata ({rec.namespaces.image.format})</strong>
                </div>
                <div className="meta-details-grid">
                  <div><small>Dimensions:</small> <strong>{rec.namespaces.image.width} &times; {rec.namespaces.image.height} px</strong></div>
                  <div><small>Aspect Ratio:</small> <span>{rec.namespaces.image.aspect_ratio}</span></div>
                  <div><small>Format:</small> <span className="ext-badge">{rec.namespaces.image.format}</span></div>
                </div>
              </div>
            )}

            {/* Binary / Executable Namespace */}
            {rec.namespaces.binary && (
              <div className="namespace-section binary-section">
                <div className="namespace-header">
                  <Icon name="procedure" />
                  <strong>Binary Format ({rec.namespaces.binary.format})</strong>
                </div>
                <div className="meta-details-grid">
                  <div><small>Platform:</small> <strong>{rec.namespaces.binary.platform}</strong></div>
                  <div><small>Format:</small> <span>{rec.namespaces.binary.format}</span></div>
                  {rec.namespaces.binary.architecture && <div><small>Arch:</small> <span className="ext-badge">{rec.namespaces.binary.architecture}</span></div>}
                </div>
              </div>
            )}

            {/* Tabular Namespace */}
            {rec.namespaces.tabular && (
              <div className="namespace-section tabular-section">
                <div className="namespace-header">
                  <Icon name="csv" />
                  <strong>Tabular Structure ({rec.namespaces.tabular.row_count} rows)</strong>
                </div>
                <div className="column-pills">
                  {rec.namespaces.tabular.columns?.map((col) => (
                    <span className="col-pill" key={col}>{col}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Text / Preview Namespace */}
            {rec.namespaces.text && (
              <div className="namespace-section text-section">
                <div className="namespace-header">
                  <Icon name="txt" />
                  <strong>Text Content ({rec.namespaces.text.line_count} lines)</strong>
                </div>
                {rec.namespaces.text.preview && (
                  <pre className="text-preview-block">{rec.namespaces.text.preview}</pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // 3. EventCollection or Timeline Renderer
  if ((type === "EventCollection" || type === "Timeline") && Array.isArray(value)) {
    const events = value as Array<{
      id: string;
      artifact_id?: string;
      kind: string;
      timestamp: string;
      description: string;
      level?: string;
    }>;

    return (
      <div className="specialized-events-view">
        <div className="result-summary-bar">
          <span>Total Events: <strong>{events.length}</strong></span>
          <span>Timeline Span: <strong>{events[0]?.timestamp?.slice(0, 10) ?? ""} &rarr; {events[events.length - 1]?.timestamp?.slice(0, 10) ?? ""}</strong></span>
        </div>
        <div className="timeline-stream">
          {events.map((evt) => {
            const level = evt.level || (evt.kind.includes("error") ? "ERROR" : evt.kind.includes("warn") ? "WARN" : "INFO");
            return (
              <div className={`timeline-row ${level.toLowerCase()}`} key={evt.id}>
                <div className="timeline-time-col">
                  <span className="time-badge">{evt.timestamp ? evt.timestamp.replace("T", " ").replace("Z", "") : "N/A"}</span>
                </div>
                <div className="timeline-bullet-col">
                  <div className={`timeline-dot ${level.toLowerCase()}`} />
                </div>
                <div className="timeline-content-col">
                  <div className="timeline-content-header">
                    <span className={`event-kind-tag ${evt.kind.replace(".", "-")}`}>{evt.kind}</span>
                    {evt.artifact_id && <span className="art-ref-pill">{evt.artifact_id}</span>}
                    <span className={`level-pill ${level.toLowerCase()}`}>{level}</span>
                  </div>
                  <div className="timeline-desc">{evt.description}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 3b. PrefetchCollection Renderer
  if ((type === "PrefetchCollection" || type === "ArtifactInspection") && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      executable_name: string;
      prefetch_file: string;
      run_count: number;
      last_execution_utc: string;
      file_path: string;
      sha256: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Prefetch Executables: <strong>{items.length}</strong></span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Executable</th>
                <th>Exec Count</th>
                <th>Last Executed (UTC)</th>
                <th>Prefetch Artifact</th>
                <th>Path</th>
              </tr>
            </thead>
            <tbody>
              {items.map((pf) => (
                <tr key={pf.id}>
                  <td><strong>{pf.executable_name}</strong></td>
                  <td><span className="ext-badge">{pf.run_count} runs</span></td>
                  <td><small className="mono-time">{pf.last_execution_utc ? pf.last_execution_utc.replace("T", " ") : "-"}</small></td>
                  <td><code className="path-code">{pf.prefetch_file}</code></td>
                  <td><code className="path-code">{pf.file_path}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 3c. IOCCollection Renderer
  if ((type === "IOCCollection" || type === "ThreatMatch") && Array.isArray(value)) {
    const items = value as Array<{
      id: string;
      matched_rule: string;
      indicator: string;
      severity: string;
      artifact_path: string;
      description: string;
    }>;

    return (
      <div className="specialized-artifact-view">
        <div className="result-summary-bar">
          <span>Matched Threat Indicators: <strong style={{ color: "#c93c3c" }}>{items.length}</strong></span>
        </div>
        <div className="result-table-wrap">
          <table className="result-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Matched Rule</th>
                <th>Indicator</th>
                <th>Artifact Path</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {items.map((ioc) => (
                <tr key={ioc.id}>
                  <td><span className={`status-tag ${ioc.severity.toLowerCase()}`}>{ioc.severity}</span></td>
                  <td><strong>{ioc.matched_rule}</strong></td>
                  <td><code className="path-code">{ioc.indicator}</code></td>
                  <td><code className="path-code">{ioc.artifact_path}</code></td>
                  <td>{ioc.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // 4. FindingCollection Renderer
  if (type === "FindingCollection" && Array.isArray(value)) {
    const findings = value as Array<{
      id: string;
      title?: string;
      severity: string;
      kind?: string;
      summary: string;
      confidence?: number;
      artifact_refs?: string[];
      event_refs?: string[];
      indicators?: string[];
      evidence_sources?: string[];
    }>;

    return (
      <div className="specialized-findings-view">
        <div className="result-summary-bar">
          <span>Correlated Findings: <strong>{findings.length}</strong></span>
          <span>High Severity: <strong>{findings.filter((f) => f.severity === "HIGH").length}</strong></span>
        </div>
        <div className="findings-stream">
          {findings.map((fnd) => (
            <div className={`forensic-finding-card severity-${fnd.severity.toLowerCase()}`} key={fnd.id}>
              <div className="fnd-header">
                <div className="fnd-title-wrap">
                  <span className={`fnd-severity-pill ${fnd.severity.toLowerCase()}`}>{fnd.severity}</span>
                  <strong>{fnd.title || fnd.id}</strong>
                </div>
                {fnd.confidence && (
                  <div className="fnd-confidence">
                    <small>Confidence:</small>
                    <span className="confidence-meter">{(fnd.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              <p className="fnd-summary-text">{fnd.summary}</p>

              {fnd.indicators && fnd.indicators.length > 0 && (
                <div className="fnd-indicators">
                  <small>KEY INDICATORS & ARTIFACT STRINGS:</small>
                  <div className="indicators-chip-list">
                    {fnd.indicators.map((ind, i) => (
                      <span className="indicator-chip" key={i}>{ind}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="fnd-refs-footer">
                {fnd.artifact_refs && fnd.artifact_refs.length > 0 && (
                  <div className="ref-group">
                    <small>Artifacts:</small>
                    {fnd.artifact_refs.map((ref) => (
                      <span className="ref-tag" key={ref}>{ref}</span>
                    ))}
                  </div>
                )}
                {fnd.event_refs && fnd.event_refs.length > 0 && (
                  <div className="ref-group">
                    <small>Events ({fnd.event_refs.length}):</small>
                    {fnd.event_refs.slice(0, 5).map((ref) => (
                      <span className="ref-tag event-tag" key={ref}>{ref}</span>
                    ))}
                    {fnd.event_refs.length > 5 && <span className="ref-tag more">+{fnd.event_refs.length - 5} more</span>}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. Export Result Renderer
  if (type === "Export" && typeof value === "object" && value !== null) {
    const exp = value as {
      status?: string;
      destination?: string;
      file_path?: string;
      relative_path?: string;
      records_count?: number;
      size_bytes?: number;
      sha256?: string;
    };

    return (
      <div className="specialized-export-view">
        <div className="export-success-box">
          <div className="export-icon"><Icon name="save" /></div>
          <div className="export-info">
            <strong>Export Written to Workspace</strong>
            <span>Destination: <code>{exp.destination || exp.relative_path}</code></span>
          </div>
        </div>
        <div className="export-details-grid">
          <div><small>Full Disk Path:</small> <code className="path-code">{exp.file_path}</code></div>
          <div><small>Records Exported:</small> <strong>{exp.records_count}</strong></div>
          <div><small>File Size:</small> <strong>{exp.size_bytes} bytes</strong></div>
          <div>
            <small>SHA-256:</small>
            <button className="hash-copy-btn" onClick={() => copyToClipboard(exp.sha256 || "")}>
              <code>{exp.sha256}</code>
              <small>{copiedHash === exp.sha256 ? "Copied" : "Copy"}</small>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Generic Table View
  const values = Array.isArray(value) ? value : [value];
  const columns =
    values.length && typeof values[0] === "object" && values[0] !== null
      ? Object.keys(values[0] as Record<string, unknown>).slice(0, 6)
      : [];

  if (columns.length > 0) {
    return (
      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {values.map((val, idx) => (
              <tr key={idx}>
                {columns.map((col) => (
                  <td key={col}>{String((val as Record<string, unknown>)[col] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return <pre className="result-pre">{JSON.stringify(value, null, 2)}</pre>;
}

type GraphMode = "pipeline" | "tree";


