export function Help() {
  return (
    <div className="docs-view" style={{ maxWidth: "900px", margin: "0 auto", padding: "32px 24px" }}>
      <header className="docs-header" style={{ marginBottom: "28px" }}>
        <small style={{ color: "#38bdf8", fontWeight: 700, letterSpacing: "1px" }}>EVIDRA FORENSIC WORKSTATION</small>
        <h1 style={{ fontSize: "24px", color: "#f8fafc", margin: "8px 0" }}>User Guide & Quick Reference</h1>
        <p style={{ color: "#94a3b8", fontSize: "13px" }}>
          Comprehensive manual for navigating Evidra, managing case workspaces, composing JOCKY procedures, and analyzing digital evidence.
        </p>
      </header>

      {/* 1. Core Modules Overview */}
      <section className="docs-section" style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "16px", color: "#f8fafc", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
          1. Forensic Workspace Modules
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#38bdf8", fontSize: "13px" }}>Case Explorer</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Browse and organize forensic evidence files, active JOCKY procedure scripts, and generated reports within the local case directory.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#c084fc", fontSize: "13px" }}>JOCKY Procedure Editor</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Multi-tab code editor with syntax highlighting, automatic error checking, and direct execution via the <code>▶ Run</code> button.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#10b981", fontSize: "13px" }}>Visual Building Blocks</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Interactive visual DAG builder. Drag and drop connection wires between nodes, configure capability parameters in the right drawer, and generate clean JOCKY code automatically.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#fb923c", fontSize: "13px" }}>Dual Forensic Graph</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Inspect script execution pipelines in the <em>Pipeline View</em> with clickable step details, or trace evidence provenance in the 3-column <em>Input-Output View</em>.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#f43f5e", fontSize: "13px" }}>Exploratory Workbench</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Ad-hoc interactive scratchpad for running quick queries, testing filters, and inspecting artifacts without modifying production procedures.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#0ea5e9", fontSize: "13px" }}>Typed Results Explorer</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Inspect artifacts, extracted metadata schemas, chronological event timelines, and correlated threat findings with copyable SHA-256 hashes.
            </p>
          </div>
        </div>
      </section>

      {/* 2. Keyboard Shortcuts */}
      <section className="docs-section" style={{ marginBottom: "32px" }}>
        <h2 style={{ fontSize: "16px", color: "#f8fafc", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
          2. Keyboard Shortcuts & Quick Actions
        </h2>
        <table className="docs-table" style={{ width: "100%", marginTop: "14px" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Shortcut</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Action</th>
              <th style={{ textAlign: "left", padding: "8px 12px" }}>Context</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: "8px 12px" }}><code>Ctrl + S</code></td>
              <td style={{ padding: "8px 12px" }}>Save Active Document</td>
              <td style={{ padding: "8px 12px", color: "#94a3b8" }}>Editor / Workbench</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px" }}><code>Ctrl + K</code></td>
              <td style={{ padding: "8px 12px" }}>Focus Global Search</td>
              <td style={{ padding: "8px 12px", color: "#94a3b8" }}>Global Shell</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px" }}><code>Click + Drag</code></td>
              <td style={{ padding: "8px 12px" }}>Create Wire Connection</td>
              <td style={{ padding: "8px 12px", color: "#94a3b8" }}>Building Blocks (from bottom port)</td>
            </tr>
            <tr>
              <td style={{ padding: "8px 12px" }}><code>Click Node</code></td>
              <td style={{ padding: "8px 12px" }}>Open Details Inspector</td>
              <td style={{ padding: "8px 12px", color: "#94a3b8" }}>Building Blocks / Pipeline Graph</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. Investigation Workflow Walkthrough */}
      <section className="docs-section">
        <h2 style={{ fontSize: "16px", color: "#f8fafc", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
          3. Recommended Investigation Workflow
        </h2>
        <ol style={{ paddingLeft: "20px", color: "#cbd5e1", lineHeight: 1.8, fontSize: "12px", marginTop: "14px" }}>
          <li><strong>Open Case:</strong> Choose a case directory in CaseGate or via <em>File &rarr; Open Case</em>.</li>
          <li><strong>Build Workflow:</strong> Open <em>Building Blocks</em> to construct your evidence processing pipeline visually, or write standard JOCKY code in the <em>Editor</em>.</li>
          <li><strong>Execute Procedure:</strong> Click <code>▶ Run</code> to execute the procedure through Evidra's deterministic Investigation IR runtime.</li>
          <li><strong>Verify Lineage:</strong> Open <em>Graph</em> &rarr; <em>Pipeline View</em> to verify execution timing and step results, or <em>Input-Output View</em> to audit evidence provenance.</li>
          <li><strong>Review Results:</strong> Examine extracted metadata, timeline events, and correlated findings in the <em>Results</em> tab.</li>
        </ol>
      </section>

      {/* 4. Forensic Tool Lineage & Specifications */}
      <section className="docs-section" style={{ marginTop: "32px" }}>
        <h2 style={{ fontSize: "16px", color: "#f8fafc", borderBottom: "1px solid #1e293b", paddingBottom: "8px" }}>
          4. Forensic Tool Lineage & Industry Specifications
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#fca5a5", fontSize: "13px" }}>VirusTotal YARA (yara.scan)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Implements libyara ruleset compilation and byte/regex string scanning for threat triage (Mimikatz, PowerShell obfuscation, WebShells, Ransomware notes).
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#fde047", fontSize: "13px" }}>Eric Zimmerman PECmd (prefetch.extract)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Implements binary SCCA header parsing across Windows NT versions (XP to 11), MAM XPRESS Huffman decompression, UTF-16LE names, and 64-bit FILETIME execution histories.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#86efac", fontSize: "13px" }}>Plaso / log2timeline (events.merge, timeline.build)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Standardizes multi-source timestamped event extraction into a deduplicated, chronological supertimeline.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#93c5fd", fontSize: "13px" }}>The Sleuth Kit (files.list, metadata.extract, hash)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Deterministic filesystem exploration, archive member extraction, and cryptographic integrity tracking.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#67e8f9", fontSize: "13px" }}>Wireshark / Zeek (pcap.analyze)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Binary Libpcap packet parsing, conversation flow reconstruction, DNS query extraction, and automated detection of C2 beacon ports.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#f472b6", fontSize: "13px" }}>Eric Zimmerman RECmd / RegRipper (registry.parse)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Parses Windows registry hives and .reg files for Auto-Start persistence (ASEP), UserAssist execution histories, and USBSTOR devices.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#d8b4fe", fontSize: "13px" }}>Sigma Rules / Splunk SPL (correlate)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Multi-branch correlation matrix synthesizing execution events, suspicious archives, network C2 beacons, and YARA hits into actionable findings.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#f43f5e", fontSize: "13px" }}>Volatility 3 Specification (memory.analyze)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Volatile memory dump parsing, EPROCESS extraction, DKOM hidden process unlinking detection, and RWX shellcode / Reflective DLL injection triage.
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#38bdf8", fontSize: "13px" }}>Eric Zimmerman EvtxECmd (evtx.parse)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Windows Event Log parser for process creations (4688), network/RDP logons (4624/4625), service installation (7045), and log clearance alerts (1102).
            </p>
          </div>

          <div style={{ background: "#0b1118", border: "1px solid #1e293b", borderRadius: "8px", padding: "14px" }}>
            <strong style={{ color: "#34d399", fontSize: "13px" }}>NIST SP 800-86 Specification (hash.verify)</strong>
            <p style={{ color: "#94a3b8", fontSize: "11px", margin: "6px 0 0", lineHeight: 1.5 }}>
              Cryptographic integrity verification comparing SHA-256 digests against chain-of-custody baselines to certify evidence integrity.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
