import { useState, useMemo } from 'react';
import { Icon, getFileIcon } from './Icon';
import { ResultEmpty } from './UI';
import type { Finding } from '../types';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';

export interface RunHistoryEntry {
  scriptName: string;
  docPath: string;
  response: RuntimeExecutionResponse;
}

export function Results({
  response,
  runHistory = [],
  activeDocPath,
  onBookmarkFinding,
}: {
  response: RuntimeExecutionResponse | null;
  runHistory?: RunHistoryEntry[];
  activeDocPath?: string | null;
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [selectedRunIndex, setSelectedRunIndex] = useState<number>(-1); // -1 means latest/active
  const [selectedResultId, setSelectedResultId] = useState<string | null>(null);

  // Determine which response to view:
  // If selectedRunIndex is -1, use response if available, else latest runHistory item
  const activeResponse: RuntimeExecutionResponse | null = useMemo(() => {
    if (selectedRunIndex >= 0 && selectedRunIndex < runHistory.length) {
      return runHistory[selectedRunIndex].response;
    }
    if (response) return response;
    if (runHistory.length > 0) return runHistory[runHistory.length - 1].response;
    return null;
  }, [response, runHistory, selectedRunIndex]);

  const results = activeResponse?.results ?? [];
  const currentResult =
    results.find((r) => r.id === selectedResultId) ??
    results[results.length - 1];

  const currentScriptName = useMemo(() => {
    if (selectedRunIndex >= 0 && selectedRunIndex < runHistory.length) {
      return runHistory[selectedRunIndex].scriptName;
    }
    if (activeResponse?.context?.script_name) {
      return activeResponse.context.script_name;
    }
    if (activeDocPath) {
      return activeDocPath.split(/[\\/]/).pop() || "Procedure";
    }
    return "Current Run";
  }, [selectedRunIndex, runHistory, activeResponse, activeDocPath]);

  return (
    <aside className="results-pane">
      {/* Top Run Switcher Bar */}
      <div className="results-run-bar">
        <div className="run-selector-left">
          <span className="run-bar-label">RUN:</span>
          {runHistory.length > 0 ? (
            <select
              className="run-select-dropdown"
              value={selectedRunIndex}
              onChange={(e) => {
                setSelectedRunIndex(Number(e.target.value));
                setSelectedResultId(null);
              }}
            >
              <option value="-1">
                ⚡ {response?.context?.script_name || "Latest Execution"} ({results.length} ops)
              </option>
              {runHistory.map((entry, idx) => (
                <option key={idx} value={idx}>
                  📄 {entry.scriptName} ({entry.response.results?.length ?? 0} ops · {entry.response.status})
                </option>
              ))}
            </select>
          ) : (
            <span className="run-single-label">📄 {currentScriptName}</span>
          )}
        </div>

        <div className="run-meta-badges">
          {activeResponse && (
            <>
              <span className={`run-status-badge ${activeResponse.status}`}>
                {activeResponse.status.toUpperCase()}
              </span>
              {activeResponse.context?.cached && (
                <span className="run-cache-badge" title="Deterministic incremental cache hit">
                  ⚡ CACHED
                </span>
              )}
              {activeResponse.context?.duration_ms !== undefined && (
                <span className="run-time-badge">{activeResponse.context.duration_ms}ms</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Operations Steps Selector */}
      {results.length > 0 && (
        <div className="results-step-selector">
          <div className="step-selector-title">
            <span>OPERATIONS ({results.length}):</span>
            <span className="step-selector-sub">{currentScriptName}</span>
          </div>
          <div className="step-chips-scroll">
            {results.map((res, idx) => {
              const step = activeResponse?.steps.find((s) => s.operation_id === res.operation_id);
              const isSelected = currentResult?.id === res.id;
              return (
                <button
                  key={res.id}
                  className={`step-chip ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedResultId(res.id)}
                  title={`${step?.capability ?? res.operation_id} -> ${res.type}`}
                >
                  <span className="step-num">{String(idx + 1).padStart(2, "0")}</span>
                  <span className="step-cap">{step?.capability ?? res.operation_id}</span>
                  <span className="step-type-pill">{res.type.replace("Collection", "")}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result Content Card */}
      {currentResult ? (
        <ResultCard
          key={currentResult.id}
          result={currentResult}
          context={activeResponse?.context}
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
          <button
            className="btn-bookmark"
            title="Bookmark as Finding"
            onClick={() => onBookmarkFinding(result)}
          >
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
          {renderSpecializedResult(result, copyToClipboard, copiedHash, onBookmarkFinding)}
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
  copiedHash: string | null,
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void
) {
  const { type, value } = result;

  // 1. ArtifactCollection Renderer
  if (type === "ArtifactCollection" && Array.isArray(value)) {
    return <ArtifactCollectionView items={value} copyToClipboard={copyToClipboard} copiedHash={copiedHash} />;
  }

  // 2. MetadataCollection Renderer
  if (type === "MetadataCollection" && Array.isArray(value)) {
    return <MetadataCollectionView records={value} />;
  }

  // 3. EventCollection or Timeline Renderer
  if ((type === "EventCollection" || type === "Timeline") && Array.isArray(value)) {
    return <TimelineCollectionView events={value} />;
  }

  // 3b. PrefetchCollection Renderer
  if ((type === "PrefetchCollection" || type === "ArtifactInspection") && Array.isArray(value)) {
    return <PrefetchCollectionView items={value} />;
  }

  // 3c. IOCCollection Renderer
  if ((type === "IOCCollection" || type === "ThreatMatch") && Array.isArray(value)) {
    return <IOCCollectionView items={value} />;
  }

  // 3d. YaraResults Renderer
  if ((type === "YaraResults" || type === "YaraMatches") && Array.isArray(value)) {
    return <YaraResultsView items={value} />;
  }

  // 3e. NetworkCollection Renderer
  if (type === "NetworkCollection" && Array.isArray(value)) {
    return <NetworkCollectionView items={value} />;
  }

  // 3f. RegistryCollection Renderer
  if (type === "RegistryCollection" && Array.isArray(value)) {
    return <RegistryCollectionView items={value} />;
  }

  // 3g. MemoryCollection Renderer (Attribution: Volatility 3 Specification)
  if ((type === "MemoryCollection" || type === "MemoryDump") && (Array.isArray(value) || (typeof value === "object" && value !== null))) {
    const memArray = Array.isArray(value) ? value : [value];
    return <MemoryCollectionView items={memArray} />;
  }

  // 3h. VerificationReport Renderer (Attribution: NIST SP 800-86)
  if (type === "VerificationReport" && typeof value === "object" && value !== null) {
    return <VerificationReportView report={value} copyToClipboard={copyToClipboard} copiedHash={copiedHash} />;
  }

  // 4. FindingCollection Renderer
  if (type === "FindingCollection" && Array.isArray(value)) {
    return (
      <FindingCollectionView
        findings={value}
        onBookmarkFinding={onBookmarkFinding}
        result={result}
      />
    );
  }

  // 5. Export Result Renderer
  if (type === "Export" && typeof value === "object" && value !== null) {
    return (
      <ExportResultView
        exp={value as any}
        copyToClipboard={copyToClipboard}
        copiedHash={copiedHash}
      />
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

// Subcomponents for specialized views with real-time filtering

function ArtifactCollectionView({
  items,
  copyToClipboard,
  copiedHash,
}: {
  items: Array<{
    id: string;
    name: string;
    relative_path: string;
    extension: string;
    size_bytes: number;
    modified_at: string;
    sha256: string;
  }>;
  copyToClipboard: (text: string) => void;
  copiedHash: string | null;
}) {
  const [filter, setFilter] = useState("");
  const [selectedExt, setSelectedExt] = useState<string>("ALL");

  const extensions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((i) => {
      if (i.extension) set.add(i.extension.toLowerCase());
    });
    return Array.from(set).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return items.filter((art) => {
      if (selectedExt !== "ALL" && art.extension.toLowerCase() !== selectedExt) {
        return false;
      }
      if (!q) return true;
      return (
        art.name.toLowerCase().includes(q) ||
        art.relative_path.toLowerCase().includes(q) ||
        (art.sha256 && art.sha256.toLowerCase().includes(q))
      );
    });
  }, [items, filter, selectedExt]);

  const totalBytes = useMemo(
    () => items.reduce((acc, i) => acc + (i.size_bytes || 0), 0),
    [items]
  );

  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span>Total: <strong>{items.length} artifacts</strong></span>
        <span>Size: <strong>{(totalBytes / 1024).toFixed(1)} KB</strong></span>
        {filter && <span>Filtered: <strong>{filteredItems.length}</strong></span>}
      </div>

      <div className="result-filter-toolbar">
        <input
          type="text"
          className="result-search-input"
          placeholder="Filter artifacts by name, path, hash..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {extensions.length > 1 && (
          <div className="ext-filter-pills">
            <button
              className={`ext-filter-btn ${selectedExt === "ALL" ? "active" : ""}`}
              onClick={() => setSelectedExt("ALL")}
            >
              All
            </button>
            {extensions.map((ext) => (
              <button
                key={ext}
                className={`ext-filter-btn ${selectedExt === ext ? "active" : ""}`}
                onClick={() => setSelectedExt(ext)}
              >
                {ext}
              </button>
            ))}
          </div>
        )}
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
            {filteredItems.map((art) => (
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

function MetadataCollectionView({ records }: { records: any[] }) {
  const [filter, setFilter] = useState("");

  const filteredRecords = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.common?.name?.toLowerCase().includes(q) ||
        r.common?.path?.toLowerCase().includes(q) ||
        r.artifact_id?.toLowerCase().includes(q)
    );
  }, [records, filter]);

  return (
    <div className="specialized-metadata-view">
      <div className="result-filter-toolbar">
        <input
          type="text"
          className="result-search-input"
          placeholder="Filter metadata records by name, path..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <span className="record-count-badge">{filteredRecords.length} records</span>
      </div>

      {filteredRecords.map((rec) => (
        <div className="meta-card" key={rec.id}>
          <div className="meta-card-header">
            <div className="meta-card-title">
              <Icon name={getFileIcon(rec.common?.name ?? "", "file")} />
              <strong>{rec.common?.name}</strong>
              <span className="meta-id-tag">{rec.artifact_id}</span>
            </div>
            <div className="meta-card-badges">
              <span className="ext-badge">{rec.common?.type}</span>
              <span className="badge completed">READ-ONLY</span>
            </div>
          </div>

          <div className="meta-details-grid">
            <div><small>Path:</small> <code>{rec.common?.path}</code></div>
            <div><small>Size:</small> <strong>{rec.common?.size} bytes</strong></div>
            <div><small>Modified:</small> <span>{rec.filesystem?.modified_at}</span></div>
          </div>

          {/* Archive Namespace */}
          {rec.namespaces?.archive && (
            <div className="namespace-section archive-section">
              <div className="namespace-header">
                <Icon name="archive" />
                <strong>Archive Deep Inspection ({rec.namespaces.archive.entries_count ?? 0} members)</strong>
                {rec.namespaces.archive.is_encrypted && <span className="badge failed">ENCRYPTED</span>}
              </div>
              {rec.namespaces.archive.suspicious_members && rec.namespaces.archive.suspicious_members.length > 0 && (
                <div className="suspicious-alert">
                  <span className="alert-icon">⚠️</span> <strong>High-Risk Members:</strong> {rec.namespaces.archive.suspicious_members.join(", ")}
                </div>
              )}
              {rec.namespaces.archive.entries && rec.namespaces.archive.entries.length > 0 && (
                <div className="archive-entries-list">
                  {rec.namespaces.archive.entries.map((ent: any, idx: number) => (
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
          {rec.namespaces?.image && (
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
          {rec.namespaces?.binary && (
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
          {rec.namespaces?.tabular && (
            <div className="namespace-section tabular-section">
              <div className="namespace-header">
                <Icon name="csv" />
                <strong>Tabular Structure ({rec.namespaces.tabular.row_count} rows)</strong>
              </div>
              <div className="column-pills">
                {rec.namespaces.tabular.columns?.map((col: string) => (
                  <span className="col-pill" key={col}>{col}</span>
                ))}
              </div>
            </div>
          )}

          {/* Text / Preview Namespace */}
          {rec.namespaces?.text && (
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

function TimelineCollectionView({ events }: { events: any[] }) {
  const [filterLevel, setFilterLevel] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((evt) => {
      const level = (evt.level || (evt.kind?.includes("error") ? "ERROR" : evt.kind?.includes("warn") ? "WARN" : "INFO")).toUpperCase();
      if (filterLevel !== "ALL" && level !== filterLevel) return false;
      if (!q) return true;
      return (
        evt.description?.toLowerCase().includes(q) ||
        evt.kind?.toLowerCase().includes(q) ||
        evt.artifact_id?.toLowerCase().includes(q)
      );
    });
  }, [events, filterLevel, search]);

  return (
    <div className="specialized-events-view">
      <div className="result-summary-bar">
        <span>Total Events: <strong>{events.length}</strong></span>
        <span>Filtered: <strong>{filteredEvents.length}</strong></span>
      </div>

      <div className="result-filter-toolbar">
        <input
          type="text"
          className="result-search-input"
          placeholder="Filter timeline events..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ext-filter-pills">
          {["ALL", "INFO", "WARN", "ERROR"].map((lvl) => (
            <button
              key={lvl}
              className={`ext-filter-btn ${filterLevel === lvl ? "active" : ""}`}
              onClick={() => setFilterLevel(lvl)}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div className="timeline-stream">
        {filteredEvents.map((evt) => {
          const level = evt.level || (evt.kind?.includes("error") ? "ERROR" : evt.kind?.includes("warn") ? "WARN" : "INFO");
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
                  <span className={`event-kind-tag ${evt.kind?.replace(".", "-")}`}>{evt.kind}</span>
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

function PrefetchCollectionView({ items }: { items: any[] }) {
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

function IOCCollectionView({ items }: { items: any[] }) {
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

function FindingCollectionView({
  findings,
  onBookmarkFinding,
  result,
}: {
  findings: any[];
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
  result: RuntimeExecutionResponse["results"][number];
}) {
  const [filterSev, setFilterSev] = useState<string>("ALL");

  const filteredFindings = useMemo(() => {
    if (filterSev === "ALL") return findings;
    return findings.filter((f) => f.severity?.toUpperCase() === filterSev);
  }, [findings, filterSev]);

  return (
    <div className="specialized-findings-view">
      <div className="result-summary-bar">
        <span>Correlated Findings: <strong>{findings.length}</strong></span>
        <span>High Severity: <strong style={{ color: "#f43f5e" }}>{findings.filter((f) => f.severity === "HIGH").length}</strong></span>
      </div>

      <div className="result-filter-toolbar">
        <div className="ext-filter-pills">
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              className={`ext-filter-btn ${filterSev === sev ? "active" : ""}`}
              onClick={() => setFilterSev(sev)}
            >
              {sev}
            </button>
          ))}
        </div>
      </div>

      <div className="findings-stream">
        {filteredFindings.map((fnd) => (
          <div className={`forensic-finding-card severity-${fnd.severity?.toLowerCase()}`} key={fnd.id}>
            <div className="fnd-header">
              <div className="fnd-title-wrap">
                <span className={`fnd-severity-pill ${fnd.severity?.toLowerCase()}`}>{fnd.severity}</span>
                <strong>{fnd.title || fnd.id}</strong>
              </div>
              <div className="fnd-header-right">
                {fnd.confidence && (
                  <div className="fnd-confidence">
                    <small>Confidence:</small>
                    <span className="confidence-meter">{(fnd.confidence * 100).toFixed(0)}%</span>
                  </div>
                )}
                <button
                  className="btn-bookmark-item"
                  title="Bookmark this individual finding"
                  onClick={() =>
                    onBookmarkFinding({
                      id: fnd.id,
                      operation_id: result.operation_id,
                      type: "Finding",
                      status: "completed",
                      source_ids: [],
                      value: fnd,
                    })
                  }
                >
                  <Icon name="bookmark" />
                </button>
              </div>
            </div>

            <p className="fnd-summary-text">{fnd.summary}</p>

            {fnd.indicators && fnd.indicators.length > 0 && (
              <div className="fnd-indicators">
                <small>KEY INDICATORS & ARTIFACT STRINGS:</small>
                <div className="indicators-chip-list">
                  {fnd.indicators.map((ind: string, i: number) => (
                    <span className="indicator-chip" key={i}>{ind}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="fnd-refs-footer">
              {fnd.artifact_refs && fnd.artifact_refs.length > 0 && (
                <div className="ref-group">
                  <small>Artifacts:</small>
                  {fnd.artifact_refs.map((ref: string) => (
                    <span className="ref-tag" key={ref}>{ref}</span>
                  ))}
                </div>
              )}
              {fnd.event_refs && fnd.event_refs.length > 0 && (
                <div className="ref-group">
                  <small>Events ({fnd.event_refs.length}):</small>
                  {fnd.event_refs.slice(0, 5).map((ref: string) => (
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

function ExportResultView({
  exp,
  copyToClipboard,
  copiedHash,
}: {
  exp: {
    status?: string;
    destination?: string;
    file_path?: string;
    relative_path?: string;
    records_count?: number;
    size_bytes?: number;
    sha256?: string;
    preview?: any;
  };
  copyToClipboard: (text: string) => void;
  copiedHash: string | null;
}) {
  const [showPreview, setShowPreview] = useState(true);

  return (
    <div className="specialized-export-view">
      <div className="export-success-box">
        <div className="export-icon"><Icon name="save" /></div>
        <div className="export-info">
          <strong>Deliverable Export Generated</strong>
          <span>Target: <code>{exp.destination || exp.relative_path}</code></span>
        </div>
      </div>

      <div className="export-details-grid">
        <div>
          <small>Destination:</small>
          <code>{exp.destination || exp.relative_path}</code>
        </div>
        <div>
          <small>Records Exported:</small>
          <strong>{exp.records_count ?? 1}</strong>
        </div>
        <div>
          <small>File Size:</small>
          <strong>
            {exp.size_bytes !== undefined
              ? exp.size_bytes < 1024
                ? `${exp.size_bytes} B`
                : `${(exp.size_bytes / 1024).toFixed(1)} KB`
              : "-"}
          </strong>
        </div>
        <div>
          <small>Status:</small>
          <span className="run-status-badge completed" style={{ display: "inline-block" }}>EXPORTED</span>
        </div>
        <div style={{ gridColumn: "span 2", display: "flex", flexDirection: "column", gap: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <small>Disk Path:</small>
            <button
              className="hash-copy-btn"
              onClick={() => copyToClipboard(exp.file_path || "")}
              title="Copy absolute path to clipboard"
            >
              <small>{copiedHash === exp.file_path ? "✓ Copied" : "Copy Path"}</small>
            </button>
          </div>
          <code className="path-code" style={{ wordBreak: "break-all", whiteSpace: "normal" }}>{exp.file_path}</code>
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <small>SHA-256 Digest:</small>
          <button className="hash-copy-btn" onClick={() => copyToClipboard(exp.sha256 || "")}>
            <code>{exp.sha256}</code>
            <small>{copiedHash === exp.sha256 ? "Copied" : "Copy"}</small>
          </button>
        </div>
      </div>

      {exp.preview && (
        <div className="export-preview-section">
          <div className="export-preview-header">
            <small>EXPORTED DATA PREVIEW</small>
            <button className="btn-toggle-preview" onClick={() => setShowPreview(!showPreview)}>
              {showPreview ? "Hide Preview" : "Show Preview"}
            </button>
          </div>
          {showPreview && (
            <pre className="export-preview-json">
              {JSON.stringify(exp.preview, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function YaraResultsView({ items }: { items: any[] }) {
  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span>YARA Signature Matches: <strong>{items.length}</strong></span>
        <span style={{ color: "#38bdf8", fontSize: "11px" }}>Engine: VirusTotal YARA</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", padding: "12px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ color: "#f87171", fontSize: "13px" }}>{item.rule_name}</strong>
                <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: item.severity === "CRITICAL" ? "rgba(239, 68, 68, 0.2)" : "rgba(249, 115, 22, 0.2)", color: item.severity === "CRITICAL" ? "#ef4444" : "#f97316", fontWeight: 700 }}>
                  {item.severity}
                </span>
              </div>
              <span style={{ fontSize: "11px", color: "#64748b", fontFamily: "monospace" }}>{item.file_path}</span>
            </div>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "0 0 8px 0" }}>{item.description}</p>
            {item.matched_strings && item.matched_strings.length > 0 && (
              <div style={{ background: "#05080f", padding: "6px 8px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace", color: "#cbd5e1" }}>
                {item.matched_strings.map((s: any, sIdx: number) => (
                  <div key={sIdx} style={{ display: "flex", gap: "8px" }}>
                    <span style={{ color: "#38bdf8" }}>{s.identifier}</span>
                    <span style={{ color: "#64748b" }}>offset {s.offset}:</span>
                    <span>{s.matched_snippet || "(pattern match)"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px", color: "#64748b" }}>
            No YARA threat signatures detected in scanned artifacts.
          </div>
        )}
      </div>
    </div>
  );
}

function NetworkCollectionView({ items }: { items: any[] }) {
  const allFlows = items.flatMap((i) => i.flows || []);
  const allAlerts = items.flatMap((i) => i.suspicious_alerts || []);
  const allDns = items.flatMap((i) => i.dns_queries || []);

  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span>Network Captures: <strong>{items.length}</strong></span>
        <span>Flows: <strong>{allFlows.length}</strong></span>
        <span>DNS Queries: <strong>{allDns.length}</strong></span>
        {allAlerts.length > 0 && (
          <span style={{ color: "#ef4444", fontWeight: 700 }}>⚠️ {allAlerts.length} Threat Alerts</span>
        )}
      </div>

      {allAlerts.length > 0 && (
        <div style={{ margin: "12px 0", display: "flex", flexDirection: "column", gap: "8px" }}>
          {allAlerts.map((alt: any, idx: number) => (
            <div key={idx} style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", padding: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#f87171", fontSize: "12px" }}>🚨 {alt.alert}</strong>
                <span style={{ fontSize: "10px", color: "#ef4444", fontWeight: 700 }}>PORT {alt.port}</span>
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "11px", marginTop: "4px" }}>
                {alt.src_ip} &rarr; {alt.dst_ip}
              </div>
            </div>
          ))}
        </div>
      )}

      <h4 style={{ fontSize: "12px", color: "#94a3b8", margin: "16px 0 8px" }}>Network Conversation Flows (Wireshark / Zeek)</h4>
      <div className="result-table-wrap">
        <table className="result-table">
          <thead>
            <tr>
              <th>Protocol</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Packets</th>
              <th>Bytes</th>
            </tr>
          </thead>
          <tbody>
            {allFlows.slice(0, 50).map((f: any, idx: number) => (
              <tr key={idx}>
                <td><span style={{ padding: "2px 5px", borderRadius: "3px", background: f.protocol === "TCP" ? "#1e3a8a" : "#065f46", color: "#93c5fd", fontSize: "10px", fontWeight: 700 }}>{f.protocol}</span></td>
                <td><code>{f.src_ip}:{f.src_port}</code></td>
                <td><code>{f.dst_ip}:{f.dst_port}</code></td>
                <td>{f.packet_count}</td>
                <td>{f.total_bytes < 1024 ? `${f.total_bytes} B` : `${(f.total_bytes / 1024).toFixed(1)} KB`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RegistryCollectionView({ items }: { items: any[] }) {
  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span>Registry Records: <strong>{items.length}</strong></span>
        <span style={{ color: "#38bdf8", fontSize: "11px" }}>Specification: Eric Zimmerman RECmd / Harlan Carvey RegRipper</span>
      </div>

      <div className="result-table-wrap" style={{ marginTop: "12px" }}>
        <table className="result-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Registry Key / Value</th>
              <th>Decoded / Target Value</th>
              <th>Severity</th>
            </tr>
          </thead>
          <tbody>
            {items.slice(0, 50).map((reg: any, idx: number) => (
              <tr key={idx}>
                <td>
                  <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: reg.category.includes("Auto-Start") || reg.category.includes("Service") ? "rgba(239, 68, 68, 0.2)" : "rgba(56, 189, 248, 0.15)", color: reg.category.includes("Auto-Start") || reg.category.includes("Service") ? "#f87171" : "#38bdf8", fontWeight: 600 }}>
                    {reg.category}
                  </span>
                </td>
                <td>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#f8fafc" }}>{reg.value_name}</div>
                  <div style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace" }}>{reg.key_path}</div>
                </td>
                <td>
                  <code style={{ fontSize: "11px", color: "#cbd5e1" }}>{reg.decoded_value || reg.value_data}</code>
                </td>
                <td>
                  <span className={`level-pill ${String(reg.severity || "info").toLowerCase()}`}>
                    {reg.severity || "INFO"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MemoryCollectionView({ items }: { items: any[] }) {
  const [filter, setFilter] = useState("");
  const [activeTab, setActiveTab] = useState<"processes" | "injections" | "lineages">("processes");

  const allProcesses = items.flatMap((i) => i.processes || []);
  const allInjections = items.flatMap((i) => i.injections || []);
  const allLineages = items.flatMap((i) => i.suspicious_lineages || []);
  const hiddenCount = allProcesses.filter((p) => p.is_hidden).length;

  const filteredProcesses = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allProcesses;
    return allProcesses.filter(
      (p) =>
        String(p.pid).includes(q) ||
        String(p.ppid).includes(q) ||
        p.image_name?.toLowerCase().includes(q) ||
        p.virtual_offset?.toLowerCase().includes(q)
    );
  }, [allProcesses, filter]);

  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span>Memory Images: <strong>{items.length}</strong></span>
        <span>Active Processes: <strong>{allProcesses.length}</strong></span>
        {hiddenCount > 0 && (
          <span style={{ color: "#ef4444", fontWeight: 700 }}>
            🚨 {hiddenCount} DKOM Hidden
          </span>
        )}
        {allInjections.length > 0 && (
          <span style={{ color: "#f43f5e", fontWeight: 700 }}>
            💉 {allInjections.length} Injections (RWX)
          </span>
        )}
        <span style={{ color: "#38bdf8", fontSize: "11px", marginLeft: "auto" }}>
          Specification: Volatility 3 Specification
        </span>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "8px", marginTop: "12px", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
        <button
          className={`ext-filter-btn ${activeTab === "processes" ? "active" : ""}`}
          onClick={() => setActiveTab("processes")}
        >
          Processes ({allProcesses.length})
        </button>
        <button
          className={`ext-filter-btn ${activeTab === "injections" ? "active" : ""}`}
          onClick={() => setActiveTab("injections")}
          style={allInjections.length > 0 ? { borderColor: "#f43f5e", color: activeTab === "injections" ? "#fff" : "#f43f5e" } : {}}
        >
          Code Injections ({allInjections.length})
        </button>
        <button
          className={`ext-filter-btn ${activeTab === "lineages" ? "active" : ""}`}
          onClick={() => setActiveTab("lineages")}
          style={allLineages.length > 0 ? { borderColor: "#fb923c", color: activeTab === "lineages" ? "#fff" : "#fb923c" } : {}}
        >
          Anomalous Lineages ({allLineages.length})
        </button>
      </div>

      {/* 1. Code Injections Tab */}
      {activeTab === "injections" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
          {allInjections.map((inj: any, idx: number) => (
            <div
              key={idx}
              style={{
                background: "rgba(244, 63, 94, 0.08)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                borderRadius: "6px",
                padding: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ color: "#f43f5e", fontSize: "14px" }}>💉</span>
                  <strong style={{ color: "#f87171", fontSize: "13px" }}>
                    {inj.process_name} (PID {inj.pid})
                  </strong>
                  <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: "rgba(244, 63, 94, 0.2)", color: "#f43f5e", fontWeight: 700 }}>
                    {inj.severity || "CRITICAL"}
                  </span>
                </div>
                <code style={{ fontSize: "11px", color: "#38bdf8" }}>{inj.address}</code>
              </div>
              <div style={{ fontSize: "11px", color: "#cbd5e1", marginBottom: "6px" }}>
                {inj.description}
              </div>
              <div style={{ display: "flex", gap: "12px", fontSize: "11px" }}>
                <span style={{ color: "#94a3b8" }}>Protection: <strong style={{ color: "#f87171" }}>{inj.protection}</strong></span>
                <span style={{ color: "#94a3b8" }}>Payload Pattern: <strong style={{ color: "#38bdf8" }}>{inj.shellcode_signature}</strong></span>
              </div>
            </div>
          ))}
          {allInjections.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
              No injected RWX memory pages or shellcode payloads detected.
            </div>
          )}
        </div>
      )}

      {/* 2. Anomalous Lineages Tab */}
      {activeTab === "lineages" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px" }}>
          {allLineages.map((lin: any, idx: number) => (
            <div
              key={idx}
              style={{
                background: "rgba(251, 146, 60, 0.08)",
                border: "1px solid rgba(251, 146, 60, 0.3)",
                borderRadius: "6px",
                padding: "12px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#fb923c", fontSize: "12px" }}>
                  ⚠️ {lin.alert}
                </strong>
                <span style={{ fontSize: "10px", color: "#fb923c", fontWeight: 700 }}>CRITICAL LINEAGE</span>
              </div>
              <div style={{ color: "#cbd5e1", fontSize: "11px", marginTop: "6px" }}>
                Parent: <code>{lin.parent_name} (PPID {lin.ppid})</code> &rarr; Child: <code>{lin.process_name} (PID {lin.pid})</code>
              </div>
            </div>
          ))}
          {allLineages.length === 0 && (
            <div style={{ textAlign: "center", padding: "32px", color: "#64748b" }}>
              No anomalous parent-child process relationships detected.
            </div>
          )}
        </div>
      )}

      {/* 3. Processes Table Tab */}
      {activeTab === "processes" && (
        <>
          <div className="result-filter-toolbar" style={{ marginTop: "12px" }}>
            <input
              type="text"
              className="result-search-input"
              placeholder="Search by process name, PID, or offset..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="result-table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>PID</th>
                  <th>PPID</th>
                  <th>Process Image</th>
                  <th>Memory Offset</th>
                  <th>Threads</th>
                  <th>Start Time (UTC)</th>
                  <th>Evasion Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcesses.map((p: any, idx: number) => (
                  <tr key={idx} style={p.is_hidden ? { background: "rgba(239, 68, 68, 0.08)" } : {}}>
                    <td><code>{p.pid}</code></td>
                    <td><code>{p.ppid}</code></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <strong>{p.image_name}</strong>
                        {p.is_hidden && (
                          <span style={{ fontSize: "9px", padding: "1px 4px", borderRadius: "3px", background: "#ef4444", color: "#fff", fontWeight: 700 }}>
                            DKOM HIDDEN
                          </span>
                        )}
                      </div>
                    </td>
                    <td><code>{p.virtual_offset}</code></td>
                    <td>{p.threads}</td>
                    <td><small className="mono-time">{p.start_time?.replace("T", " ")}</small></td>
                    <td>
                      {p.is_hidden ? (
                        <span style={{ color: "#f87171", fontSize: "11px", fontWeight: 600 }}>
                          ⚠️ Unlinked from ActiveProcessLinks
                        </span>
                      ) : (
                        <span style={{ color: "#10b981", fontSize: "11px" }}>✓ Active Link</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function VerificationReportView({
  report,
  copyToClipboard,
  copiedHash,
}: {
  report: any;
  copyToClipboard: (text: string) => void;
  copiedHash: string | null;
}) {
  const isVerified = report.status === "VERIFIED";
  const records = report.verified_records || [];

  return (
    <div className="specialized-artifact-view">
      <div className="result-summary-bar">
        <span style={{ color: isVerified ? "#10b981" : "#ef4444", fontWeight: 700 }}>
          {isVerified ? "✓ NIST CRYPTOGRAPHIC INTEGRITY VERIFIED" : "🚨 EVIDENCE CONTAMINATION DETECTED"}
        </span>
        <span>Total Verified: <strong>{report.total_checked}</strong></span>
        <span>Mismatches: <strong style={{ color: report.mismatch_count > 0 ? "#ef4444" : "#10b981" }}>{report.mismatch_count}</strong></span>
        <span style={{ color: "#38bdf8", fontSize: "11px", marginLeft: "auto" }}>
          Standard: NIST SP 800-86
        </span>
      </div>

      <div className="result-table-wrap" style={{ marginTop: "12px" }}>
        <table className="result-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Artifact ID</th>
              <th>Relative Path</th>
              <th>SHA-256 Digest</th>
            </tr>
          </thead>
          <tbody>
            {records.map((rec: any, idx: number) => (
              <tr key={idx}>
                <td>
                  <span style={{ padding: "2px 6px", borderRadius: "4px", fontSize: "10px", fontWeight: 700, background: rec.status === "VERIFIED" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.2)", color: rec.status === "VERIFIED" ? "#10b981" : "#ef4444" }}>
                    {rec.status}
                  </span>
                </td>
                <td><code>{rec.artifact_id}</code></td>
                <td><code className="path-code">{rec.path}</code></td>
                <td>
                  <button
                    className="hash-copy-btn"
                    onClick={() => copyToClipboard(rec.sha256 || "")}
                    title="Click to copy SHA-256 digest"
                  >
                    <code>{rec.sha256?.substring(0, 16)}...</code>
                    <small>{copiedHash === rec.sha256 ? "✓" : "Copy"}</small>
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
