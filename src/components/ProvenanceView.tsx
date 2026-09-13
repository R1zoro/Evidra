import React, { useState } from "react";
import { Icon } from "./Icon";
import type { RuntimeExecutionResponse } from "../api/runtimeClient";
import type { FsNode } from "../types";

export interface ProvenanceViewProps {
  tree: FsNode[];
  response: RuntimeExecutionResponse | null;
  runHistory: { scriptName: string; docPath: string; response: RuntimeExecutionResponse }[];
  caseName?: string;
  onSelectDoc?: (path: string) => void;
}

interface EvidenceFileItem {
  id: string;
  name: string;
  path: string;
  folder: string;
  isContributory: boolean;
}

interface ExportItem {
  id: string;
  name: string;
  type: string;
  path: string;
  scriptId: string;
  format: string;
  size: string;
  generatedAt: string;
  description: string;
  inputSources: {
    folder: string;
    items: { name: string; checked: boolean }[];
  }[];
  downstreamCount: number;
}

export function ProvenanceView({
  tree: _tree,
  response: _response,
  runHistory: _runHistory,
  caseName = "Company_Investigation",
  onSelectDoc: _onSelectDoc,
}: ProvenanceViewProps) {
  const [selectedExportId, setSelectedExportId] = useState<string>("exp-triage");
  const [activeTab, setActiveTab] = useState<"details" | "lineage" | "preview">("details");
  const [groupByScript, setGroupByScript] = useState(true);
  const [showFileNodes, setShowFileNodes] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(100);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    "Documents": true,
    "Finance": true,
    "Downloads": true,
    "Logs": false,
    "Browser": false,
  });

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  // Mocked/derived case evidence tree structure matching reference mockup
  const evidenceSources = [
    {
      id: "src-1",
      name: caseName.replace(/[^A-Za-z0-9_]/g, "_") || "Company_collection",
      path: `C:\\Cases\\${caseName.replace(/[^A-Za-z0-9_]/g, "_") || "Company_collection"}`,
      totalFiles: 5,
      selectedFiles: 3,
      totalFolders: 2,
      selectedFolders: 1,
    },
  ];

  const filesInFinance: EvidenceFileItem[] = [
    { id: "f-1", name: "q3_report.pdf", path: "Documents/Finance/q3_report.pdf", folder: "Finance", isContributory: false },
    { id: "f-2", name: "invoice.zip", path: "Documents/Finance/invoice.zip", folder: "Finance", isContributory: true },
  ];

  const filesInDownloads: EvidenceFileItem[] = [
    { id: "f-3", name: "update.exe", path: "Downloads/update.exe", folder: "Downloads", isContributory: true },
    { id: "f-4", name: "payload.ps1", path: "Downloads/payload.ps1", folder: "Downloads", isContributory: true },
    { id: "f-5", name: "readme.txt", path: "Downloads/readme.txt", folder: "Downloads", isContributory: true },
    { id: "f-6", name: "image.jpg", path: "Downloads/image.jpg", folder: "Downloads", isContributory: false },
    { id: "f-7", name: "archive.bin", path: "Downloads/archive.bin", folder: "Downloads", isContributory: false },
  ];

  // Script nodes in center column
  const scripts = [
    { id: "script-threat", name: "script_02_threat_hunter.jocky", blocks: 7, isActive: true },
    { id: "script-investigation", name: "investigation.jocky", blocks: 8, isActive: false },
    { id: "script-analysis", name: "script_03_full_analysis.jocky", blocks: 9, isActive: false },
  ];

  // Export nodes in right column
  const exportsList: ExportItem[] = [
    {
      id: "exp-triage",
      name: "triage_metadata.json",
      type: "JSON Report",
      path: "./Outputs/triage_metadata.json",
      scriptId: "script-threat",
      format: "JSON",
      size: "248 KB",
      generatedAt: "Today 13:10",
      description: "Metadata of suspicious files",
      inputSources: [
        {
          folder: "Documents/Finance",
          items: [
            { name: "invoice.zip", checked: true },
            { name: "update.exe", checked: true },
            { name: "payload.ps1", checked: true },
            { name: "readme.txt", checked: false },
          ],
        },
      ],
      downstreamCount: 2,
    },
    {
      id: "exp-suspicious",
      name: "suspicious_files.csv",
      type: "CSV",
      path: "./Outputs/suspicious_files.csv",
      scriptId: "script-threat",
      format: "CSV",
      size: "12 KB",
      generatedAt: "Today 13:10",
      description: "Filtered artifact inventory",
      inputSources: [],
      downstreamCount: 1,
    },
    {
      id: "exp-timeline",
      name: "timeline_events.json",
      type: "JSON",
      path: "./Outputs/timeline_events.json",
      scriptId: "script-threat",
      format: "JSON",
      size: "95 KB",
      generatedAt: "Today 13:10",
      description: "Extracted event stream",
      inputSources: [],
      downstreamCount: 1,
    },
    {
      id: "exp-findings",
      name: "findings.json",
      type: "JSON",
      path: "./Outputs/findings.json",
      scriptId: "script-investigation",
      format: "JSON",
      size: "42 KB",
      generatedAt: "Today 14:32",
      description: "Correlated findings and threat indicators",
      inputSources: [],
      downstreamCount: 0,
    },
    {
      id: "exp-network",
      name: "network_summary.json",
      type: "JSON",
      path: "./Outputs/network_summary.json",
      scriptId: "script-analysis",
      format: "JSON",
      size: "310 KB",
      generatedAt: "Today 14:45",
      description: "PCAP session conversation breakdown",
      inputSources: [],
      downstreamCount: 1,
    },
    {
      id: "exp-report",
      name: "case_report.html",
      type: "HTML",
      path: "./Outputs/case_report.html",
      scriptId: "script-analysis",
      format: "HTML",
      size: "512 KB",
      generatedAt: "Today 14:45",
      description: "Final forensic executive investigation brief",
      inputSources: [],
      downstreamCount: 0,
    },
  ];

  const selectedExport = exportsList.find((e) => e.id === selectedExportId) || exportsList[0];

  return (
    <div className="provenance-view-container">
      {/* Top Controls Bar */}
      <div className="provenance-topbar">
        <div className="topbar-left">
          <label className="view-dropdown-label">
            <span>View:</span>
            <select className="prov-select" defaultValue="all">
              <option value="all">All Scripts (Unified)</option>
              <option value="active">Active Script Only</option>
              <option value="recent">Most Recent Run</option>
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
            Show File/Folder Nodes
          </label>
        </div>

        <div className="prov-legend-chips">
          <span className="prov-chip cyan">
            <span className="dot cyan" /> Evidence (Input)
          </span>
          <span className="prov-chip purple">
            <span className="dot purple" /> Script
          </span>
          <span className="prov-chip orange">
            <span className="dot orange" /> Intermediate
          </span>
          <span className="prov-chip green">
            <span className="dot green" /> Export (Output)
          </span>
        </div>

        <div className="topbar-right">
          <button className="prov-btn secondary" onClick={() => setZoomLevel(100)}>
            Fit to View
          </button>
          <button className="prov-btn icon" title="Maximize">
            <Icon name="maximize" />
          </button>
        </div>
      </div>

      {/* Main Mapping Area + Selected Item Drawer */}
      <div className="provenance-main-split">
        {/* Graph Canvas Area */}
        <div className="provenance-canvas" style={{ zoom: `${zoomLevel}%` }}>
          <div className="canvas-header-title">
            <h2>Input-Output Mapping</h2>
            <p>Data flow across all JOCKY scripts in the current workspace</p>
          </div>

          <div className="mapping-grid">
            {/* Column 1: Evidence Hierarchy */}
            <div className="mapping-column evidence-column">
              {evidenceSources.map((src) => (
                <div key={src.id} className="evidence-root-card">
                  <div className="evidence-card-header">
                    <div className="card-icon-title">
                      <div className="evidence-folder-icon">
                        <Icon name="folder" />
                      </div>
                      <div>
                        <strong>{src.name}</strong>
                        <span className="card-sub">{src.path}</span>
                      </div>
                    </div>
                    <div className="header-badges">
                      <span className="count-pill cyan">
                        {src.selectedFiles}/{src.totalFiles} files
                      </span>
                      <span className="count-pill blue">
                        {src.selectedFolders}/{src.totalFolders} folders
                      </span>
                    </div>
                  </div>

                  {/* Nested Evidence Folders */}
                  <div className="evidence-tree-content">
                    {/* Documents Folder */}
                    <div className="tree-folder-group">
                      <div
                        className="folder-row"
                        onClick={() => toggleFolder("Documents")}
                      >
                        <span className="twisty">
                          {expandedFolders["Documents"] ? "⌄" : "›"}
                        </span>
                        <Icon name="folder" />
                        <span className="folder-name">Documents (1/2)</span>
                      </div>

                      {expandedFolders["Documents"] && (
                        <div className="tree-subfolder-group">
                          <div
                            className="folder-row sub"
                            onClick={() => toggleFolder("Finance")}
                          >
                            <span className="twisty">
                              {expandedFolders["Finance"] ? "⌄" : "›"}
                            </span>
                            <Icon name="folder" />
                            <span className="folder-name">Finance (1/2)</span>
                          </div>

                          {expandedFolders["Finance"] && (
                            <div className="files-list">
                              {filesInFinance.map((f) => (
                                <div
                                  key={f.id}
                                  className={`file-item-row ${
                                    f.isContributory && selectedExportId === "exp-triage"
                                      ? "contributory-active"
                                      : ""
                                  }`}
                                >
                                  <span className="file-check-icon">
                                    {f.isContributory && selectedExportId === "exp-triage" ? (
                                      <span className="check-badge">✔</span>
                                    ) : (
                                      <Icon name="file" />
                                    )}
                                  </span>
                                  <span className="file-name">{f.name}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="folder-row sub collapsed">
                            <span className="twisty">›</span>
                            <Icon name="folder" />
                            <span className="folder-name">HR</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Downloads Folder */}
                    <div className="tree-folder-group">
                      <div
                        className="folder-row"
                        onClick={() => toggleFolder("Downloads")}
                      >
                        <span className="twisty">
                          {expandedFolders["Downloads"] ? "⌄" : "›"}
                        </span>
                        <Icon name="folder" />
                        <span className="folder-name">Downloads (3/5)</span>
                      </div>

                      {expandedFolders["Downloads"] && (
                        <div className="files-list">
                          {filesInDownloads.map((f) => (
                            <div
                              key={f.id}
                              className={`file-item-row ${
                                f.isContributory && selectedExportId === "exp-triage"
                                  ? "contributory-active"
                                  : ""
                              }`}
                            >
                              <span className="file-check-icon">
                                {f.isContributory && selectedExportId === "exp-triage" ? (
                                  <span className="check-badge">✔</span>
                                ) : (
                                  <Icon name="file" />
                                )}
                              </span>
                              <span className="file-name">{f.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Logs & Browser Collapsed */}
                    <div className="tree-folder-group">
                      <div className="folder-row collapsed">
                        <span className="twisty">›</span>
                        <Icon name="folder" />
                        <span className="folder-name">Logs (0/3)</span>
                      </div>
                      <div className="folder-row collapsed">
                        <span className="twisty">›</span>
                        <Icon name="folder" />
                        <span className="folder-name">Browser (0/4)</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Other Evidence Sources */}
              <div className="evidence-secondary-card">
                <div className="sec-icon"><Icon name="folder" /></div>
                <div>
                  <strong>Memory_Dump</strong>
                  <small>D:\Forensics\Memory</small>
                </div>
              </div>

              <div className="evidence-secondary-card">
                <div className="sec-icon"><Icon name="folder" /></div>
                <div>
                  <strong>Network_Capture</strong>
                  <small>D:\Forensics\PCAP</small>
                </div>
              </div>
            </div>

            {/* SVG Connecting Flow Lines between Column 1 -> 2 -> 3 */}
            <svg className="flow-lines-overlay" aria-hidden="true">
              {/* Contributory flow to active script */}
              <path
                d="M 270 190 C 330 190, 340 160, 395 160"
                className="flow-curve-selected"
              />
              <path
                d="M 270 295 C 330 295, 340 180, 395 180"
                className="flow-curve-selected"
              />
              {/* Connecting from script-threat to selected export */}
              <path
                d="M 585 160 C 640 160, 650 90, 695 90"
                className="flow-curve-selected"
              />
              {/* Other flows to other exports */}
              <path
                d="M 585 170 C 630 170, 650 170, 695 170"
                className="flow-curve-other"
              />
              <path
                d="M 585 180 C 630 180, 650 240, 695 240"
                className="flow-curve-other"
              />
              <path
                d="M 585 300 C 630 300, 650 310, 695 310"
                className="flow-curve-unrelated"
              />
              <path
                d="M 585 410 C 630 410, 650 380, 695 380"
                className="flow-curve-unrelated"
              />
              <path
                d="M 585 420 C 630 420, 650 450, 695 450"
                className="flow-curve-unrelated"
              />
            </svg>

            {/* Column 2: Script Cards */}
            <div className="mapping-column scripts-column">
              <div className="flow-label-badge">
                <span>3 files</span>
                <small>1 folder</small>
              </div>

              {scripts.map((sc) => {
                const isSelected = sc.id === "script-threat";
                return (
                  <div
                    key={sc.id}
                    className={`script-flow-card ${isSelected ? "selected-script" : ""}`}
                    onClick={() => {}}
                  >
                    <div className="script-card-icon">
                      <Icon name="bolt" />
                    </div>
                    <div className="script-card-content">
                      <strong>{sc.name}</strong>
                      <span>{sc.blocks} blocks</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Column 3: Export Artifacts */}
            <div className="mapping-column exports-column">
              {exportsList.map((exp) => {
                const isSelected = exp.id === selectedExportId;
                return (
                  <div
                    key={exp.id}
                    className={`export-flow-card ${isSelected ? "selected-export" : ""}`}
                    onClick={() => setSelectedExportId(exp.id)}
                  >
                    <div className="export-card-icon">
                      <Icon name="file" />
                    </div>
                    <div className="export-card-content">
                      <strong>{exp.name}</strong>
                      <span>{exp.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Bar: Legend, Stats & Minimap Controls */}
          <div className="provenance-bottom-bar">
            <div className="bottom-legend">
              <span className="legend-line purple">── Selected data flow</span>
              <span className="legend-line slate">── Other data flows</span>
              <span className="legend-line dashed">┈┈ Unrelated</span>
            </div>

            <div className="bottom-summary">
              <span>3/5 files selected</span>
              <span className="sep">|</span>
              <span>1/2 folders selected</span>
            </div>

            <div className="bottom-zoom-controls">
              <div className="canvas-minimap-preview">
                <div className="mini-viewport-box" />
              </div>
              <button
                className="zoom-btn"
                onClick={() => setZoomLevel((z) => Math.max(z - 10, 50))}
              >
                -
              </button>
              <span className="zoom-text">{zoomLevel}%</span>
              <button
                className="zoom-btn"
                onClick={() => setZoomLevel((z) => Math.min(z + 10, 150))}
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Column 4 / Right Panel: Selected Item Inspection Drawer */}
        {selectedExport && (
          <aside className="selected-item-drawer">
            <header className="drawer-header">
              <div className="drawer-title-group">
                <div className="drawer-icon-box">
                  <Icon name="file" />
                </div>
                <div>
                  <h3>{selectedExport.name}</h3>
                  <span className="drawer-sub">{selectedExport.type}</span>
                  <div className="drawer-path">{selectedExport.path}</div>
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
            <div className="drawer-tabs">
              <button
                className={`drawer-tab ${activeTab === "details" ? "active" : ""}`}
                onClick={() => setActiveTab("details")}
              >
                Details
              </button>
              <button
                className={`drawer-tab ${activeTab === "lineage" ? "active" : ""}`}
                onClick={() => setActiveTab("lineage")}
              >
                Lineage
              </button>
              <button
                className={`drawer-tab ${activeTab === "preview" ? "active" : ""}`}
                onClick={() => setActiveTab("preview")}
              >
                Preview
              </button>
            </div>

            <div className="drawer-body">
              {activeTab === "details" && (
                <div className="tab-details-content">
                  {/* Metadata Table */}
                  <div className="metadata-kv-list">
                    <div className="kv-row">
                      <span className="k">Type</span>
                      <span className="v">Export</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Format</span>
                      <span className="v">{selectedExport.format}</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Created by</span>
                      <span className="v code-hl">{selectedExport.scriptId}.jocky</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Generated at</span>
                      <span className="v">{selectedExport.generatedAt}</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Size</span>
                      <span className="v">{selectedExport.size}</span>
                    </div>
                    <div className="kv-row">
                      <span className="k">Description</span>
                      <span className="v">{selectedExport.description}</span>
                    </div>
                  </div>

                  {/* Input Sources Section */}
                  <div className="drawer-section">
                    <div className="section-head-with-action">
                      <h4>Input Sources (4)</h4>
                      <button className="btn-show-graph">Show in Graph</button>
                    </div>

                    <div className="input-sources-tree">
                      <div className="input-folder-header">
                        <Icon name="folder" />
                        <span>Documents/Finance</span>
                        <span className="item-count-badge">1/2 items ›</span>
                      </div>

                      <div className="input-items-list">
                        <div className="input-item-check">
                          <Icon name="file" />
                          <span>invoice.zip</span>
                          <span className="check-purple">✔</span>
                        </div>
                        <div className="input-item-check">
                          <Icon name="file" />
                          <span>update.exe</span>
                          <span className="check-purple">✔</span>
                        </div>
                        <div className="input-item-check">
                          <Icon name="file" />
                          <span>payload.ps1</span>
                          <span className="check-purple">✔</span>
                        </div>
                        <div className="input-item-check unselected">
                          <Icon name="file" />
                          <span>readme.txt</span>
                          <span className="circle-gray">○</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Downstream Usage Section */}
                  <div className="drawer-section">
                    <h4>Downstream Usage</h4>
                    <div className="downstream-card">
                      <Icon name="bookmark" />
                      <span>Used in {selectedExport.downstreamCount} subsequent blocks</span>
                      <span className="chevron">›</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "lineage" && (
                <div className="tab-lineage-content">
                  <div className="lineage-step">
                    <div className="lineage-node cyan">Evidence</div>
                    <span className="lineage-arrow">↓</span>
                    <div className="lineage-node purple">script_02_threat_hunter.jocky</div>
                    <span className="lineage-arrow">↓</span>
                    <div className="lineage-node green">triage_metadata.json</div>
                  </div>
                </div>
              )}

              {activeTab === "preview" && (
                <div className="tab-preview-content">
                  <pre className="json-preview-box">
{`{
  "export_id": "${selectedExport.id}",
  "file": "${selectedExport.name}",
  "records_count": 4,
  "sources": [
    "Documents/Finance/invoice.zip",
    "Downloads/update.exe",
    "Downloads/payload.ps1"
  ],
  "sha256": "4a7d8c9b2e1f0a3d4e5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f"
}`}
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
