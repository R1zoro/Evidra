import React, { useState } from 'react';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';
import { Icon } from './Icon';
import { ProvenanceView } from './ProvenanceView';
import type { FsNode } from '../types';

export type GraphMode = "pipeline" | "tree";

export interface PipelineStep {
  id: string;
  name: string;
  capability: string;
  category: "import" | "copy" | "scan" | "filter" | "metadata" | "events" | "timeline" | "correlate" | "export" | "hash" | "memory" | "network" | "ioc" | "report";
  status: "completed" | "running" | "partial" | "failed" | "skipped";
  duration?: string;
  detail?: string;
}

export interface ScriptLane {
  id: string;
  scriptName: string;
  status: "completed" | "running" | "partial" | "failed" | "skipped";
  blockCount: number;
  duration: string;
  lastRun: string;
  steps: PipelineStep[];
}

export function Graph({
  response,
  runHistory,
  tree = [],
  caseName = "Company_Investigation",
  onSelectDoc,
  onRunScript,
  onRunAll: _onRunAll,
}: {
  response: RuntimeExecutionResponse | null;
  runHistory: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
  tree?: FsNode[];
  caseName?: string;
  onSelectDoc?: (path: string) => void;
  onRunScript?: (scriptName: string) => void;
  onRunAll?: () => void;
}) {
  const [graphMode, setGraphMode] = useState<GraphMode>("pipeline");
  const [showStatus, setShowStatus] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(80);
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
  const [selectedStep, setSelectedStep] = useState<PipelineStep | null>(null);
  const [selectedLane, setSelectedLane] = useState<ScriptLane | null>(null);

  const toggleLaneCollapse = (laneId: string) => {
    setCollapsedLanes((prev) => ({ ...prev, [laneId]: !prev[laneId] }));
  };

  // Build lanes from real runHistory
  const lanesToDisplay: ScriptLane[] = runHistory.map((realRun, idx) => {
    const mappedSteps: PipelineStep[] = realRun.response.steps.map((step, sIdx) => {
      let cat: PipelineStep["category"] = "scan";
      if (step.capability.includes("import")) cat = "import";
      else if (step.capability.includes("copy")) cat = "copy";
      else if (step.capability.includes("filter")) cat = "filter";
      else if (step.capability.includes("metadata")) cat = "metadata";
      else if (step.capability.includes("events")) cat = "events";
      else if (step.capability.includes("timeline")) cat = "timeline";
      else if (step.capability.includes("correlate")) cat = "correlate";
      else if (step.capability.includes("export")) cat = "export";
      else if (step.capability.includes("hash")) cat = "hash";
      else if (step.capability.includes("ioc")) cat = "ioc";

      const stepStatus = step.status === "completed" || step.status === "reused"
        ? "completed"
        : step.status === "failed"
        ? "failed"
        : step.status === "running"
        ? "running"
        : "skipped";

      return {
        id: `s-lane${idx}-step${sIdx}`,
        name: step.capability.replace(/\./g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        capability: step.capability,
        category: cat,
        status: stepStatus,
        detail: step.message || "Executed without error.",
      };
    });

    return {
      id: `lane-${idx}`,
      scriptName: realRun.scriptName,
      status: realRun.response.status === "completed" ? "completed" : "failed",
      blockCount: mappedSteps.length,
      duration: realRun.response.results?.length ? "Completed" : "00:00:00",
      lastRun: new Date().toLocaleTimeString(),
      steps: mappedSteps,
    };
  });

  const getCategoryColor = (category: PipelineStep["category"]) => {
    switch (category) {
      case "import": return "#38bdf8";
      case "copy": return "#818cf8";
      case "scan": return "#f59e0b";
      case "filter": return "#c084fc";
      case "metadata": return "#10b981";
      case "events": return "#fb923c";
      case "timeline": return "#f97316";
      case "correlate": return "#f43f5e";
      case "export": return "#0ea5e9";
      case "hash": return "#a855f7";
      case "memory": return "#ec4899";
      case "network": return "#06b6d4";
      case "ioc": return "#e11d48";
      default: return "#94a3b8";
    }
  };

  return (
    <div className="graph-view-container" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden", background: "#090d14" }}>
      {/* Top Controls Toolbar */}
      <div className="graph-view-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 24px", background: "#0b1118", borderBottom: "1px solid #1e293b", zIndex: 10 }}>
        <div className="graph-view-tabs" style={{ display: "flex", gap: "4px", background: "#f1f5f9", padding: "3px", borderRadius: "6px" }}>
          <button
            className={`graph-tab-btn ${graphMode === "pipeline" ? "active" : ""}`}
            onClick={() => setGraphMode("pipeline")}
            style={{ padding: "5px 12px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", background: graphMode === "pipeline" ? "#ffffff" : "transparent", color: graphMode === "pipeline" ? "#0284c7" : "#64748b", border: 0, cursor: "pointer", boxShadow: graphMode === "pipeline" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
          >
            <Icon name="graph" /> Pipeline View
          </button>
          <button
            className={`graph-tab-btn ${graphMode === "tree" ? "active" : ""}`}
            onClick={() => setGraphMode("tree")}
            style={{ padding: "5px 12px", fontSize: "10px", fontWeight: 600, borderRadius: "4px", background: graphMode === "tree" ? "#ffffff" : "transparent", color: graphMode === "tree" ? "#0284c7" : "#64748b", border: 0, cursor: "pointer", boxShadow: graphMode === "tree" ? "0 1px 3px rgba(0,0,0,0.08)" : "none" }}
          >
            <Icon name="tree" /> Input-Output View
          </button>
        </div>

        {graphMode === "pipeline" && (
          <div className="graph-header-controls">
            <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "#cbd5e1" }}>
              <input
                type="checkbox"
                checked={showStatus}
                onChange={(e) => setShowStatus(e.target.checked)}
              />
              Show Execution Status
            </label>
          </div>
        )}
      </div>

      {/* Render Pipeline Execution View */}
      {graphMode === "pipeline" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden", position: "relative" }}>
          <div className="pipeline-view-canvas" style={{ flex: 1 }}>
            {/* Horizontal Multi-Script Lanes */}
            <div className="pipeline-lanes-container" style={{ zoom: `${zoomLevel}%` }}>
              {lanesToDisplay.length === 0 ? (
                <div style={{ padding: "80px 20px", textAlign: "center", color: "#64748b" }}>
                  <div style={{ fontSize: "36px", color: "#38bdf8", marginBottom: "12px" }}>
                    <Icon name="graph" />
                  </div>
                  <h3>No Execution History Found</h3>
                  <p style={{ fontSize: "12px", color: "#94a3b8" }}>
                    Execute a JOCKY script from the editor to see its pipeline graph here.
                  </p>
                </div>
              ) : (
                lanesToDisplay.map((lane) => {
                  const isCollapsed = collapsedLanes[lane.id] ?? false;

                  return (
                    <section key={lane.id} className="pipeline-lane">
                      {/* Lane Header */}
                      <div className="lane-header">
                        <div className="lane-title">
                          <Icon name="bolt" />
                          <strong
                            style={{ cursor: "pointer" }}
                            onClick={() => onSelectDoc?.(lane.scriptName)}
                            title="Open script in editor"
                          >
                            {lane.scriptName}
                          </strong>
                          <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "4px", background: lane.status === 'completed' ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.18)', color: lane.status === 'completed' ? '#34d399' : '#f87171' }}>
                            ● {lane.status.charAt(0).toUpperCase() + lane.status.slice(1)}
                          </span>
                          <span style={{ fontSize: "10px", color: "#64748b", fontFamily: "Cascadia Code, monospace" }}>
                            · {lane.blockCount} blocks | {lane.duration} | Last run: {lane.lastRun}
                          </span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          {onRunScript && (
                            <button
                              className="lane-run-btn"
                              onClick={() => onRunScript(lane.scriptName)}
                              title="Re-run this script"
                            >
                              ▶ Run
                            </button>
                          )}
                          <button
                            style={{ background: "transparent", color: "#94a3b8", border: 0, cursor: "pointer" }}
                            onClick={() => toggleLaneCollapse(lane.id)}
                            title={isCollapsed ? "Expand Lane" : "Collapse Lane"}
                          >
                            {isCollapsed ? "⌄ Expand" : "⌃ Collapse"}
                          </button>
                        </div>
                      </div>

                      {/* Lane Steps Flow */}
                      {!isCollapsed && (
                        <div className="lane-steps-row">
                          {lane.steps.map((step, idx) => {
                            const isLast = idx === lane.steps.length - 1;
                            const isSelected = selectedStep?.id === step.id;
                            let statusClass = "pending";
                            if (step.status === "completed") statusClass = "completed";
                            else if (step.status === "running") statusClass = "running";
                            else if (step.status === "failed") statusClass = "failed";

                            return (
                              <React.Fragment key={step.id}>
                                <div
                                  className={`pipeline-step-node ${isSelected ? "selected" : ""}`}
                                  style={{
                                    cursor: "pointer",
                                    borderColor: isSelected ? "#38bdf8" : undefined,
                                    boxShadow: isSelected ? "0 0 12px rgba(56, 189, 248, 0.3)" : undefined,
                                  }}
                                  onClick={() => {
                                    setSelectedStep(step);
                                    setSelectedLane(lane);
                                  }}
                                  title="Click to view step details"
                                >
                                  <div className="step-node-header">
                                    <strong style={{ fontSize: "11px", color: "#f8fafc" }}>{step.name}</strong>
                                    {showStatus && (
                                      <span className={`step-status-badge ${statusClass}`}>
                                        {step.status.toUpperCase()}
                                      </span>
                                    )}
                                  </div>
                                  <div className="step-node-cap">{step.capability}</div>
                                </div>

                                {/* Connecting Arrow between Nodes */}
                                {!isLast && (
                                  <div className="step-arrow-connector">
                                    ▶
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })
              )}
            </div>

            {/* Bottom Floating Minimap & Zoom */}
            <div className="pipeline-minimap">
              <div className="pipeline-zoom-controls">
                <button
                  className="pipeline-zoom-btn"
                  onClick={() => setZoomLevel((z) => Math.max(z - 10, 40))}
                >
                  -
                </button>
                <span style={{ fontSize: "10px", color: "#cbd5e1", padding: "0 4px", fontWeight: "bold" }}>{zoomLevel}%</span>
                <button
                  className="pipeline-zoom-btn"
                  onClick={() => setZoomLevel((z) => Math.min(z + 10, 150))}
                >
                  +
                </button>
                <button
                  className="pipeline-zoom-btn"
                  onClick={() => setZoomLevel(100)}
                  title="Reset zoom"
                >
                  [ ]
                </button>
              </div>
            </div>
          </div>

          {/* Right-Side Step Details Drawer (Collapsible & Clickable) */}
          {selectedStep && (
            <aside className="graph-step-details-drawer">
              <header className="step-drawer-header">
                <div className="step-drawer-title-group">
                  <div
                    className="step-drawer-icon"
                    style={{
                      backgroundColor: `${getCategoryColor(selectedStep.category)}22`,
                      color: getCategoryColor(selectedStep.category),
                    }}
                  >
                    <Icon name="bolt" />
                  </div>
                  <div>
                    <h3 className="step-drawer-title">{selectedStep.name}</h3>
                    <span className="step-drawer-sub">{selectedStep.capability}</span>
                  </div>
                </div>

                <button
                  className="btn-close-step-drawer"
                  onClick={() => setSelectedStep(null)}
                  title="Close Details"
                >
                  ✕
                </button>
              </header>

              <div className="step-drawer-body">
                {/* Status & Timing Banner */}
                <div className="step-meta-banner">
                  <div className="step-meta-item">
                    <span className="step-meta-label">Status</span>
                    <span className={`step-status-badge ${selectedStep.status}`}>
                      {selectedStep.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="step-meta-item">
                    <span className="step-meta-label">Category</span>
                    <span
                      className="category-pill-badge"
                      style={{
                        backgroundColor: `${getCategoryColor(selectedStep.category)}22`,
                        color: getCategoryColor(selectedStep.category),
                      }}
                    >
                      {selectedStep.category}
                    </span>
                  </div>
                  <div className="step-meta-item">
                    <span className="step-meta-label">Duration</span>
                    <span className="step-meta-value">
                      {selectedStep.duration || "< 10ms"}
                    </span>
                  </div>
                </div>

                {/* Execution Context */}
                <div className="step-drawer-section">
                  <h4 className="section-heading">Procedure Script</h4>
                  <div className="script-link-row">
                    <span className="script-name-tag">
                      <Icon name="procedure" /> {selectedLane?.scriptName || "Active Script"}
                    </span>
                    {onSelectDoc && selectedLane && (
                      <button
                        className="btn-jump-editor"
                        onClick={() => onSelectDoc(selectedLane.scriptName)}
                      >
                        Open in Editor ↗
                      </button>
                    )}
                  </div>
                </div>

                {/* Capability Details & Output */}
                <div className="step-drawer-section">
                  <h4 className="section-heading">Execution Details</h4>
                  <div className="step-detail-box">
                    <p className="step-detail-message">
                      {selectedStep.detail || "Step completed successfully with output verification."}
                    </p>
                  </div>
                </div>

                {/* Provenance Connection Info */}
                <div className="step-drawer-section">
                  <h4 className="section-heading">Lineage & Flow</h4>
                  <p style={{ fontSize: "11px", color: "#94a3b8", lineHeight: 1.5, margin: 0 }}>
                    This operation participated in the evidence processing pipeline for <strong>{caseName}</strong>. Switch to the <em>Input-Output View</em> above to trace artifact provenance.
                  </p>
                </div>
              </div>
            </aside>
          )}
        </div>
      )}

      {/* Render Input-Output / Provenance View */}
      {graphMode === "tree" && (
        <ProvenanceView
          tree={tree}
          response={response}
          runHistory={runHistory}
          caseName={caseName}
          onSelectDoc={onSelectDoc}
        />
      )}
    </div>
  );
}
