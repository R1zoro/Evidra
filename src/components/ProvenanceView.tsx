import React, { useState, useMemo } from "react";
import { Icon } from "./Icon";
import type { RuntimeExecutionResponse } from "../api/runtimeClient";
import type { FsNode } from "../types";

export interface ProvenanceViewProps {
  tree: FsNode[];
  response: RuntimeExecutionResponse | null;
  runHistory: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
  caseName?: string;
  onSelectDoc?: (path: string) => void;
  activeDocPath?: string | null;
}

interface DynamicEvidenceFile {
  id: string;
  name: string;
  path: string;
  folder: string;
  size?: number;
  isContributory: boolean;
  scriptName?: string;
}

interface DynamicExportItem {
  id: string;
  name: string;
  type: string;
  path: string;
  scriptName: string;
  format: string;
  size: string;
  generatedAt: string;
  description: string;
  recordsCount: number;
  sha256?: string;
  previewData?: any;
  inputSources: string[];
}

export function ProvenanceView({
  tree = [],
  response,
  runHistory = [],
  caseName = "Company_Investigation",
  onSelectDoc,
  activeDocPath,
}: ProvenanceViewProps) {
  const [selectedExportId, setSelectedExportId] = useState<string>("");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"details" | "lineage" | "preview">("details");
  const [filterMode, setFilterMode] = useState<string>("all");
  const [groupByScript, setGroupByScript] = useState(true);
  const [showFileNodes, setShowFileNodes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Extract all distinct script names in runHistory
  const allScriptNames = useMemo(() => {
    const set = new Set<string>();
    runHistory.forEach((r) => {
      if (r.scriptName) set.add(r.scriptName);
    });
    return Array.from(set);
  }, [runHistory]);

  const activeScriptName = useMemo(() => {
    if (activeDocPath) {
      return activeDocPath.split(/[\\/]/).pop() || null;
    }
    return response?.context?.script_name || null;
  }, [activeDocPath, response]);

  // 1. Group runs by scriptName
  const allUniqueScripts = useMemo(() => {
    const map = new Map<string, { scriptName: string; runsCount: number; stepsCount: number; lastStatus: string; docPath: string }>();
    runHistory.forEach((r) => {
      const existing = map.get(r.scriptName);
      if (!existing) {
        map.set(r.scriptName, {
          scriptName: r.scriptName,
          runsCount: 1,
          stepsCount: r.response.steps?.length || 0,
          lastStatus: r.response.status || "completed",
          docPath: r.docPath,
        });
      } else {
        existing.runsCount += 1;
        existing.stepsCount = r.response.steps?.length || existing.stepsCount;
        existing.lastStatus = r.response.status || existing.lastStatus;
      }
    });
    return Array.from(map.values());
  }, [runHistory]);

  // Apply filterMode to uniqueScripts
  const uniqueScripts = useMemo(() => {
    if (filterMode === "all") return allUniqueScripts;
    if (filterMode === "recent") {
      if (runHistory.length === 0) return [];
      const latest = runHistory[runHistory.length - 1].scriptName;
      return allUniqueScripts.filter((s) => s.scriptName === latest);
    }
    if (filterMode === "active") {
      if (!activeScriptName) return allUniqueScripts;
      return allUniqueScripts.filter((s) => s.scriptName === activeScriptName);
    }
    if (filterMode.startsWith("script:")) {
      const target = filterMode.slice("script:".length);
      return allUniqueScripts.filter((s) => s.scriptName === target);
    }
    return allUniqueScripts;
  }, [allUniqueScripts, filterMode, runHistory, activeScriptName]);

  const allowedScriptNames = useMemo(() => new Set(uniqueScripts.map((s) => s.scriptName)), [uniqueScripts]);

  // 2. Dynamically extract export artifacts across runs
  const dynamicExports = useMemo<DynamicExportItem[]>(() => {
    const list: DynamicExportItem[] = [];
    runHistory.forEach((run, rIdx) => {
      if (!allowedScriptNames.has(run.scriptName)) return;

      const results = run.response?.results || [];
      results.forEach((res, resIdx) => {
        if (res.type === "Export" && res.value && typeof res.value === "object") {
          const v = res.value as Record<string, any>;
          const dest = v.relative_path || v.destination || "export.json";
          const ext = dest.split(".").pop()?.toUpperCase() || "JSON";
          const sizeKb = v.size_bytes !== undefined ? (v.size_bytes / 1024).toFixed(1) + " KB" : "Unknown";

          list.push({
            id: `exp-${rIdx}-${resIdx}`,
            name: dest.split(/[\\/]/).pop() || dest,
            type: `${ext} Deliverable`,
            path: v.file_path || v.destination || dest,
            scriptName: run.scriptName,
            format: ext,
            size: sizeKb,
            generatedAt: new Date().toLocaleTimeString(),
            description: `Forensic export artifact produced by procedure ${run.scriptName}`,
            recordsCount: v.records_count || 1,
            sha256: v.sha256,
            previewData: v.preview,
            inputSources: [],
          });
        }
      });
    });
    return list;
  }, [runHistory, allowedScriptNames]);

  // 3. Dynamically extract evidence files from results or tree
  const dynamicFiles = useMemo<DynamicEvidenceFile[]>(() => {
    const filesMap = new Map<string, DynamicEvidenceFile>();

    // Check ArtifactCollection results in runHistory
    runHistory.forEach((run) => {
      if (!allowedScriptNames.has(run.scriptName)) return;
      const results = run.response?.results || [];
      results.forEach((res) => {
        if (res.type === "ArtifactCollection" && Array.isArray(res.value)) {
          res.value.forEach((art: any, aIdx: number) => {
            const relPath = art.relative_path || art.name || `file_${aIdx}`;
            const cleanPath = relPath.replace(/\\/g, "/");
            const parts = cleanPath.split("/");
            const fileName = parts.pop() || cleanPath;
            const folder = parts.length > 0 ? parts.join("/") : "Evidence";

            filesMap.set(cleanPath, {
              id: `evid-f-${cleanPath}`,
              name: fileName,
              path: cleanPath,
              folder: folder,
              size: art.size_bytes,
              isContributory: true,
              scriptName: run.scriptName,
            });
          });
        }
      });
    });

    // If no artifact collection produced, look at tree for evidence files
    if (filesMap.size === 0 && tree.length > 0) {
      const walk = (nodes: FsNode[], parentFolder = "") => {
        nodes.forEach((n) => {
          if (n.kind === "file") {
            const cleanPath = n.path.replace(/\\/g, "/");
            const folder = parentFolder || "Evidence";
            filesMap.set(cleanPath, {
              id: `evid-tree-${cleanPath}`,
              name: n.name,
              path: cleanPath,
              folder: folder,
              isContributory: true,
            });
          } else if (n.kind === "directory" && n.children) {
            walk(n.children, parentFolder ? `${parentFolder}/${n.name}` : n.name);
          }
        });
      };
      walk(tree);
    }

    return Array.from(filesMap.values());
  }, [runHistory, allowedScriptNames, tree]);

  // Group dynamic files by folder
  const foldersMap = useMemo(() => {
    const map = new Map<string, DynamicEvidenceFile[]>();
    dynamicFiles.forEach((f) => {
      const list = map.get(f.folder) || [];
      list.push(f);
      map.set(f.folder, list);
    });
    return map;
  }, [dynamicFiles]);

  const folderNames = Array.from(foldersMap.keys());

  // Automatically select first export if none selected and exports exist
  const selectedExport = useMemo(() => {
    if (!dynamicExports.length) return null;
    return dynamicExports.find((e) => e.id === selectedExportId) || dynamicExports[0];
  }, [dynamicExports, selectedExportId]);

  // If runHistory is completely empty, show clean empty state
  if (runHistory.length === 0) {
    return (
      <div className="provenance-view-container" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", background: "#090d14", color: "#cbd5e1" }}>
        <div className="provenance-topbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", background: "#0b1118", borderBottom: "1px solid #1e293b" }}>
          <div className="topbar-left" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#38bdf8" }}>
              <Icon name="tree" /> Input-Output Lineage
            </span>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", textAlign: "center" }}>
          <div style={{ fontSize: "42px", color: "#38bdf8", marginBottom: "16px" }}>
            <Icon name="tree" />
          </div>
          <h3 style={{ fontSize: "17px", fontWeight: 600, color: "#f8fafc", margin: "0 0 8px" }}>
            No Evidence Lineage Available
          </h3>
          <p style={{ fontSize: "12px", color: "#94a3b8", maxWidth: "460px", lineHeight: 1.6, margin: 0 }}>
            Execute one or more JOCKY procedure scripts from the editor to automatically map input evidence sources, active procedures, and generated export artifacts.
          </p>
        </div>
      </div>
    );
  }

  // Layout coordinates for SVG wires
  // Column 1 (Evidence): Left = 24px, Width = 260px -> Right port is at X = 284px, Y = 68px
  const evidPortX = 284;
  const evidPortY = 68;

  // Column 2 (Procedures): Left = 344px, Width = 200px
  // InPort X = 344px, OutPort X = 544px
  // Card index i center Y = 28px (header) + i * 72px + 28px = 56 + i * 72
  const getScriptY = (sIdx: number) => 56 + sIdx * 72;

  // Column 3 (Exports): Left = 604px, Width = 220px
  // InPort X = 604px
  // Card index j center Y = 28px (header) + j * 72px + 28px = 56 + j * 72
  const getExportY = (eIdx: number) => 56 + eIdx * 72;

  return (
    <div className="provenance-view-container">
      {/* Top Controls Bar */}
      <div className="provenance-topbar">
        <div className="topbar-left">
          <label className="view-dropdown-label">
            <span>View:</span>
            <select
              className="prov-select"
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value)}
            >
              <option value="all">All Scripts (Unified · {allUniqueScripts.length})</option>
              {runHistory.length > 0 && (
                <option value="recent">
                  Recent: {runHistory[runHistory.length - 1].scriptName}
                </option>
              )}
              {activeScriptName && (
                <option value="active">
                  Active Editor: {activeScriptName}
                </option>
              )}
              {allScriptNames.length > 1 && (
                <optgroup label="Per-Script Isolation">
                  {allScriptNames.map((name) => (
                    <option key={name} value={`script:${name}`}>
                      Script: {name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>

          <label className="prov-checkbox-label">
            <input
              type="checkbox"
              checked={groupByScript}
              onChange={(e) => setGroupByScript(e.target.checked)}
            />
            Group by Script
          </label>

          <label className="prov-checkbox-label">
            <input
              type="checkbox"
              checked={showFileNodes}
              onChange={(e) => setShowFileNodes(e.target.checked)}
            />
            Show File Nodes
          </label>
        </div>

        <div className="prov-legend-chips">
          <span className="prov-chip cyan">
            <span className="dot cyan" /> Evidence ({dynamicFiles.length})
          </span>
          <span className="prov-chip purple">
            <span className="dot purple" /> Procedures ({uniqueScripts.length})
          </span>
          <span className="prov-chip green">
            <span className="dot green" /> Exports ({dynamicExports.length})
          </span>
        </div>

        <div className="topbar-right">
          <button className="prov-btn secondary" onClick={() => setZoomLevel(100)}>
            Fit to View
          </button>
        </div>
      </div>

      {/* Main Mapping Area + Selected Item Drawer */}
      <div className="provenance-main-split" style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
        {/* Graph Canvas Area */}
        <div className="provenance-canvas" style={{ zoom: `${zoomLevel}%`, flex: 1, overflow: "auto", position: "relative", padding: "24px" }}>
          <div className="canvas-header-title" style={{ marginBottom: "20px" }}>
            <h2 style={{ fontSize: "16px", color: "#f8fafc", margin: "0 0 4px" }}>Evidence Provenance & Data Flow</h2>
            <p style={{ fontSize: "11px", color: "#94a3b8", margin: 0 }}>
              Lineage tracing across {filterMode === "all" ? "all procedures" : filterMode.replace("script:", "")} in <strong>{caseName}</strong>
            </p>
          </div>

          <div className="mapping-grid" style={{ display: "flex", gap: "60px", position: "relative", minHeight: "520px" }}>
            {/* Column 1: Evidence Hierarchy */}
            <div className="mapping-column evidence-column" style={{ width: "260px", flexShrink: 0, zIndex: 2 }}>
              <div className="evidence-root-card" style={{ background: "#0d1520", border: "1px solid #1e293b", borderRadius: "8px", padding: "12px", marginBottom: "12px", position: "relative" }}>
                <div className="evidence-card-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                  <div className="card-icon-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div className="evidence-folder-icon" style={{ color: "#38bdf8" }}>
                      <Icon name="folder" />
                    </div>
                    <div>
                      <strong style={{ fontSize: "12px", color: "#f1f5f9" }}>{caseName.replace(/[^A-Za-z0-9_]/g, "_")}</strong>
                      <span className="card-sub" style={{ display: "block", fontSize: "10px", color: "#64748b" }}>Case Evidence</span>
                    </div>
                  </div>
                  <div className="header-badges" style={{ display: "flex", gap: "4px" }}>
                    <span className="count-pill cyan" style={{ fontSize: "9px", background: "rgba(56,189,248,0.15)", color: "#38bdf8", padding: "2px 6px", borderRadius: "4px" }}>
                      {dynamicFiles.length} files
                    </span>
                  </div>
                </div>

                {/* Dynamic Evidence Folders & Files */}
                {showFileNodes && (
                  <div className="evidence-tree-content">
                    {folderNames.map((folderName) => {
                      const files = foldersMap.get(folderName) || [];
                      const isExpanded = expandedFolders[folderName] ?? true;

                      return (
                        <div key={folderName} className="tree-folder-group" style={{ marginBottom: "6px" }}>
                          <div
                            className="folder-row"
                            onClick={() => toggleFolder(folderName)}
                            style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "#cbd5e1", cursor: "pointer", padding: "4px 6px", borderRadius: "4px" }}
                          >
                            <span className="twisty">{isExpanded ? "⌄" : "›"}</span>
                            <Icon name="folder" />
                            <span className="folder-name" style={{ fontWeight: 500 }}>{folderName} ({files.length})</span>
                          </div>

                          {isExpanded && (
                            <div className="files-list" style={{ paddingLeft: "16px", marginTop: "4px" }}>
                              {files.map((f) => (
                                <div
                                  key={f.id}
                                  className={`file-item-row ${f.isContributory ? "contributory-active" : ""}`}
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    fontSize: "10px",
                                    color: "#94a3b8",
                                    padding: "3px 6px",
                                    borderRadius: "3px",
                                  }}
                                  title={f.path}
                                >
                                  <span className="file-check-icon" style={{ color: "#38bdf8" }}>
                                    <Icon name="file" />
                                  </span>
                                  <span className="file-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {f.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* SVG Connecting Flow Lines between Column 1 -> 2 -> 3 */}
            <svg
              className="flow-lines-overlay"
              aria-hidden="true"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
                zIndex: 1,
              }}
            >
              {/* Lines from Evidence Root -> Procedures */}
              {uniqueScripts.map((sc, sIdx) => {
                const isSelectedScript = selectedScriptId === sc.scriptName || selectedExport?.scriptName === sc.scriptName;
                const x1 = evidPortX;
                const y1 = evidPortY;
                const x2 = 344; // Left of Column 2
                const y2 = getScriptY(sIdx);
                const dx = x2 - x1;
                const cx1 = x1 + dx * 0.5;
                const cx2 = x2 - dx * 0.5;

                return (
                  <g key={`curve-evid-script-${sc.scriptName}`}>
                    {/* Shadow / glow path if selected */}
                    {isSelectedScript && (
                      <path
                        d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={6}
                        strokeOpacity={0.25}
                      />
                    )}
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                      stroke={isSelectedScript ? "#38bdf8" : "#334155"}
                      strokeWidth={isSelectedScript ? 2.5 : 1.5}
                      strokeOpacity={isSelectedScript ? 1 : 0.45}
                      fill="none"
                    />
                    {/* Port indicator dots */}
                    <circle cx={x1} cy={y1} r={3} fill="#38bdf8" />
                    <circle cx={x2} cy={y2} r={3} fill="#818cf8" />
                  </g>
                );
              })}

              {/* Lines from Procedures -> Export Deliverables */}
              {dynamicExports.map((exp, eIdx) => {
                const sIdx = uniqueScripts.findIndex((s) => s.scriptName === exp.scriptName);
                if (sIdx < 0) return null;

                const x1 = 544; // Right of Column 2
                const y1 = getScriptY(sIdx);
                const x2 = 604; // Left of Column 3
                const y2 = getExportY(eIdx);
                const dx = x2 - x1;
                const cx1 = x1 + dx * 0.5;
                const cx2 = x2 - dx * 0.5;

                const isSelected = selectedExport?.id === exp.id;
                const isSelectedParent = selectedScriptId === exp.scriptName;

                const strokeColor = isSelected ? "#10b981" : isSelectedParent ? "#38bdf8" : "#334155";
                const strokeOpacity = isSelected ? 1 : isSelectedParent ? 0.8 : 0.35;
                const strokeW = isSelected ? 3 : isSelectedParent ? 2 : 1.5;

                return (
                  <g key={`curve-script-export-${exp.id}`}>
                    {isSelected && (
                      <path
                        d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth={7}
                        strokeOpacity={0.28}
                      />
                    )}
                    <path
                      d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                      stroke={strokeColor}
                      strokeWidth={strokeW}
                      strokeOpacity={strokeOpacity}
                      fill="none"
                    />
                    <circle cx={x1} cy={y1} r={3} fill="#818cf8" />
                    <circle cx={x2} cy={y2} r={3} fill="#10b981" />
                  </g>
                );
              })}
            </svg>

            {/* Column 2: Script Cards */}
            <div className="mapping-column scripts-column" style={{ width: "200px", flexShrink: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "#818cf8", height: "16px", lineHeight: "16px" }}>
                Active Procedures ({uniqueScripts.length})
              </div>

              {uniqueScripts.map((sc) => {
                const isSelected = selectedScriptId === sc.scriptName || selectedExport?.scriptName === sc.scriptName;
                return (
                  <div
                    key={sc.scriptName}
                    className={`script-flow-card ${isSelected ? "selected-script" : ""}`}
                    onClick={() => {
                      setSelectedScriptId(sc.scriptName);
                      if (onSelectDoc) onSelectDoc(sc.scriptName);
                    }}
                    style={{
                      background: isSelected ? "rgba(129, 140, 248, 0.14)" : "#0d1520",
                      border: `1px solid ${isSelected ? "#818cf8" : "#1e293b"}`,
                      borderRadius: "6px",
                      padding: "10px 12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      height: "56px",
                      boxSizing: "border-box",
                      transition: "all 0.15s ease",
                      boxShadow: isSelected ? "0 0 14px rgba(129, 140, 248, 0.25)" : "none",
                    }}
                  >
                    <div className="script-card-icon" style={{ color: "#818cf8" }}>
                      <Icon name="bolt" />
                    </div>
                    <div className="script-card-content" style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ display: "block", fontSize: "11px", color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {sc.scriptName}
                      </strong>
                      <span style={{ fontSize: "10px", color: "#64748b" }}>
                        {sc.stepsCount} steps · {sc.runsCount} run{sc.runsCount > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column 3: Export Artifacts */}
            <div className="mapping-column exports-column" style={{ width: "220px", flexShrink: 0, zIndex: 2, display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ fontSize: "10px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.05em", color: "#34d399", height: "16px", lineHeight: "16px" }}>
                Export Deliverables ({dynamicExports.length})
              </div>

              {dynamicExports.length === 0 ? (
                <div style={{ padding: "16px", background: "#0d1520", border: "1px dashed #1e293b", borderRadius: "6px", color: "#64748b", fontSize: "11px" }}>
                  No export operations recorded for this view.
                </div>
              ) : (
                dynamicExports.map((exp) => {
                  const isSelected = selectedExport?.id === exp.id;
                  return (
                    <div
                      key={exp.id}
                      className={`export-flow-card ${isSelected ? "selected-export" : ""}`}
                      onClick={() => {
                        setSelectedExportId(exp.id);
                        setSelectedScriptId(exp.scriptName);
                      }}
                      style={{
                        background: isSelected ? "rgba(16, 185, 129, 0.14)" : "#0d1520",
                        border: `1px solid ${isSelected ? "#10b981" : "#1e293b"}`,
                        borderRadius: "6px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        height: "56px",
                        boxSizing: "border-box",
                        transition: "all 0.15s ease",
                        boxShadow: isSelected ? "0 0 14px rgba(16, 185, 129, 0.25)" : "none",
                      }}
                    >
                      <div className="export-card-icon" style={{ color: "#10b981" }}>
                        <Icon name="file" />
                      </div>
                      <div className="export-card-content" style={{ flex: 1, minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "11px", color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {exp.name}
                        </strong>
                        <span style={{ fontSize: "10px", color: "#64748b" }}>
                          {exp.type} · {exp.size}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right-Side Item Inspector Drawer */}
        {selectedExport && (
          <aside
            className="provenance-details-drawer"
            style={{
              width: "360px",
              background: "#0b1118",
              borderLeft: "1px solid #1e293b",
              display: "flex",
              flexDirection: "column",
              height: "100%",
              zIndex: 10,
              boxShadow: "-4px 0 20px rgba(0,0,0,0.5)",
            }}
          >
            <header className="drawer-header" style={{ padding: "14px 16px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ color: "#10b981", fontSize: "18px" }}>
                  <Icon name="file" />
                </div>
                <div>
                  <strong style={{ display: "block", fontSize: "12px", color: "#f8fafc" }}>{selectedExport.name}</strong>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>{selectedExport.type}</span>
                  <div style={{ fontSize: "9px", color: "#38bdf8", marginTop: "2px", wordBreak: "break-all" }}>{selectedExport.path}</div>
                </div>
              </div>
              <button
                className="drawer-close-btn"
                onClick={() => setSelectedExportId("")}
                title="Close Drawer"
              >
                ✕
              </button>
            </header>

            {/* Tabs: Details / Lineage / Preview */}
            <div className="drawer-tabs" style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#090d14" }}>
              <button
                className={`drawer-tab ${activeTab === "details" ? "active" : ""}`}
                onClick={() => setActiveTab("details")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "details" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "details" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Details
              </button>
              <button
                className={`drawer-tab ${activeTab === "lineage" ? "active" : ""}`}
                onClick={() => setActiveTab("lineage")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "lineage" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "lineage" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Lineage
              </button>
              <button
                className={`drawer-tab ${activeTab === "preview" ? "active" : ""}`}
                onClick={() => setActiveTab("preview")}
                style={{ flex: 1, padding: "8px 0", background: "transparent", border: 0, borderBottom: activeTab === "preview" ? "2px solid #38bdf8" : "2px solid transparent", color: activeTab === "preview" ? "#38bdf8" : "#64748b", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}
              >
                Preview
              </button>
            </div>

            <div className="drawer-body" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
              {activeTab === "details" && (
                <div className="details-section" style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                  <div className="detail-meta-table" style={{ background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", padding: "10px", fontSize: "11px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Format</span>
                      <strong style={{ color: "#f8fafc" }}>{selectedExport.format}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Created By</span>
                      <strong style={{ color: "#818cf8" }}>{selectedExport.scriptName}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Records</span>
                      <strong style={{ color: "#f8fafc" }}>{selectedExport.recordsCount}</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "#64748b" }}>Size</span>
                      <strong style={{ color: "#f8fafc" }}>{selectedExport.size}</strong>
                    </div>
                    {selectedExport.sha256 && (
                      <div style={{ marginTop: "8px", paddingTop: "8px", borderTop: "1px solid #1e293b" }}>
                        <span style={{ display: "block", color: "#64748b", fontSize: "10px", marginBottom: "4px" }}>SHA256 Hash</span>
                        <code style={{ fontSize: "9.5px", color: "#38bdf8", wordBreak: "break-all" }}>{selectedExport.sha256}</code>
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 style={{ fontSize: "11px", textTransform: "uppercase", color: "#cbd5e1", margin: "0 0 6px" }}>Evidence Source</h4>
                    <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                      Processed from <strong>{caseName}</strong> evidence inputs via procedure <strong>{selectedExport.scriptName}</strong>.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "lineage" && (
                <div className="lineage-tree-view">
                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#38bdf8", fontWeight: 600 }}>LEVEL 1: SOURCE EVIDENCE</span>
                    <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{caseName} (Raw Directory)</div>
                  </div>

                  <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", margin: "4px 0" }}>↓</div>

                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "10px", color: "#818cf8", fontWeight: 600 }}>LEVEL 2: ACTIVE PROCEDURE</span>
                    <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{selectedExport.scriptName}</div>
                  </div>

                  <div style={{ textAlign: "center", color: "#64748b", fontSize: "12px", margin: "4px 0" }}>↓</div>

                  <div style={{ padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px" }}>
                    <span style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}>LEVEL 3: EXPORT DELIVERABLE</span>
                    <div style={{ fontSize: "11px", color: "#f8fafc", marginTop: "4px" }}>{selectedExport.name}</div>
                  </div>
                </div>
              )}

              {activeTab === "preview" && (
                <div className="preview-code-view">
                  <pre style={{ margin: 0, padding: "10px", background: "#090d14", border: "1px solid #1e293b", borderRadius: "6px", fontSize: "10.5px", color: "#cbd5e1", maxHeight: "360px", overflow: "auto", fontFamily: "monospace" }}>
                    {selectedExport.previewData
                      ? JSON.stringify(selectedExport.previewData, null, 2)
                      : JSON.stringify({ file: selectedExport.name, status: "exported", records_count: selectedExport.recordsCount, sha256: selectedExport.sha256 }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
