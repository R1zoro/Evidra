import { useState } from "react";

export function Docs() {
  const [copiedScript, setCopiedScript] = useState(false);

  const demoScript = `# JOCKY Forensic Investigation Procedure
# Digital Forensics Domain-Specific Language

[prepare]
    source_laptop = evidence.import "C:\\Cases\\Laptop_1"
    source_memory = evidence.import "D:\\Forensics\\Memory"
    working = copy source_laptop as "working_evidence"
    hash_report = hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".exe" | ".bat" | ".ps1") from artifacts
    metadata = metadata.extract suspicious
    yara_hits = yara.scan suspicious with "threat_triage.yar"

[analysis]
    events = events.extract from suspicious
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, timeline, yara_hits)

[export]
    export findings > "./Outputs/investigation_report.json"`;

  const copyScript = () => {
    void navigator.clipboard.writeText(demoScript);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  return (
    <div className="docs-view">
      <header className="docs-header">
        <small>EVIDRA · JOCKY DOMAIN-SPECIFIC LANGUAGE</small>
        <h1>JOCKY Specification, Rules & Capabilities</h1>
        <p>Reference guide for non-destructive digital forensic automation, deterministic lowering, and multi-vector correlation.</p>
      </header>

      {/* 1. Core Principles & Philosophy */}
      <section className="docs-section">
        <h2>1. Investigation Lifecycle & Architectural Rules</h2>
        <p>
          JOCKY structures digital forensic procedures into four deterministic stages aligned with standard forensic frameworks (NIST SP 800-86 & ISO/IEC 27037):
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Investigative Scope</th>
              <th>Permitted Actions & Invariants</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>[prepare]</code></td>
              <td>Evidence Registration</td>
              <td>Read-only external source registration (<code>evidence.import</code>) and cryptographic materialization (<code>copy ... as</code>). Original evidence is never modified.</td>
            </tr>
            <tr>
              <td><code>[examine]</code></td>
              <td>Artifact Enumeration & Triage</td>
              <td>Artifact discovery (<code>files.list</code>), criteria-based narrowing (<code>filter</code>, <code>files.search</code>), signature rulesets (<code>yara.scan</code>), and normalized metadata extraction (<code>metadata.extract</code>).</td>
            </tr>
            <tr>
              <td><code>[analysis]</code></td>
              <td>Event Reconstruction & Correlation</td>
              <td>Timestamped event extraction (<code>events.extract</code>), dataset combination (<code>events.merge</code>), timeline sequencing (<code>timeline.build</code>), and cross-collection correlation (<code>correlate</code>).</td>
            </tr>
            <tr>
              <td><code>[export]</code></td>
              <td>Reporting & Persistence</td>
              <td>Deterministic export of typed findings, timelines, or artifact manifests to the active workspace (<code>export &gt; "./path.json"</code>).</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 2. Standard Capability Catalog */}
      <section className="docs-section">
        <h2>2. Forensic Capability Reference Table</h2>
        <p>All JOCKY operations map to typed Investigation IR capabilities executed through auditable local providers:</p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Input Type</th>
              <th>Output Type</th>
              <th>Syntax Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>evidence.import</code></td>
              <td>String Path</td>
              <td><code>EvidenceReference</code></td>
              <td><code>source = evidence.import "C:\\Cases\\Evidence"</code></td>
            </tr>
            <tr>
              <td><code>copy</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>working = copy source as "working_evidence"</code></td>
            </tr>
            <tr>
              <td><code>hash</code></td>
              <td><code>EvidenceReference</code> | <code>ArtifactCollection</code></td>
              <td><code>IntegrityRecord</code></td>
              <td><code>hash_report = hash working</code></td>
            </tr>
            <tr>
              <td><code>files.list</code></td>
              <td><code>EvidenceReference</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>artifacts = files.list working</code></td>
            </tr>
            <tr>
              <td><code>filter</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>suspicious = filter(extension == ".zip" | ".exe") from artifacts</code></td>
            </tr>
            <tr>
              <td><code>files.search</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>logs = files.search "*.log" from artifacts</code></td>
            </tr>
            <tr>
              <td><code>metadata.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>MetadataCollection</code></td>
              <td><code>metadata = metadata.extract suspicious</code></td>
            </tr>
            <tr>
              <td><code>yara.scan</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>YaraResults</code></td>
              <td><code>hits = yara.scan suspicious with "rules.yar"</code></td>
            </tr>
            <tr>
              <td><code>prefetch.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>PrefetchCollection</code></td>
              <td><code>pf_entries = prefetch.extract artifacts</code></td>
            </tr>
            <tr>
              <td><code>pcap.analyze</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>NetworkCollection</code></td>
              <td><code>net = pcap.analyze pcap_files</code></td>
            </tr>
            <tr>
              <td><code>registry.parse</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>RegistryCollection</code></td>
              <td><code>reg = registry.parse reg_hives</code></td>
            </tr>
            <tr>
              <td><code>memory.analyze</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>MemoryCollection</code></td>
              <td><code>mem = memory.analyze mem_dumps</code></td>
            </tr>
            <tr>
              <td><code>evtx.parse</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>EventCollection</code></td>
              <td><code>events = evtx.parse evtx_logs</code></td>
            </tr>
            <tr>
              <td><code>hash.verify</code></td>
              <td><code>EvidenceReference</code> | <code>ArtifactCollection</code></td>
              <td><code>VerificationReport</code></td>
              <td><code>verify = hash.verify working</code></td>
            </tr>
            <tr>
              <td><code>events.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>EventCollection</code></td>
              <td><code>events = events.extract from artifacts</code></td>
            </tr>
            <tr>
              <td><code>events.merge</code></td>
              <td>Multiple Collections</td>
              <td><code>MergedDataset</code></td>
              <td><code>combined = events.merge meta_1, meta_2</code></td>
            </tr>
            <tr>
              <td><code>timeline.build</code></td>
              <td><code>EventCollection</code> | <code>MergedDataset</code></td>
              <td><code>Timeline</code></td>
              <td><code>timeline = timeline.build from events</code></td>
            </tr>
            <tr>
              <td><code>correlate</code></td>
              <td>Multiple Collections</td>
              <td><code>FindingCollection</code></td>
              <td><code>findings = correlate(suspicious, metadata, timeline)</code></td>
            </tr>
            <tr>
              <td><code>export</code></td>
              <td>Any Collection</td>
              <td><code>ExportReport</code></td>
              <td><code>export findings &gt; "./Outputs/findings.json"</code></td>
            </tr>
          </tbody>
        </table>

        {/* Tool Lineage Attribution */}
        <h3 style={{ marginTop: "24px", color: "#38bdf8", fontSize: "14px" }}>Industry Tool Lineage & Standards</h3>
        <p style={{ color: "#94a3b8", fontSize: "12px" }}>
          Evidra capabilities implement and formalize proven methodologies from premier forensic and incident response tools:
        </p>
        <table className="docs-table" style={{ marginTop: "10px" }}>
          <thead>
            <tr>
              <th>Capability</th>
              <th>Standard Tool / Specification</th>
              <th>Methodology & Forensic Scope</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>yara.scan</code></td>
              <td><strong style={{ color: "#fca5a5" }}>VirusTotal YARA</strong></td>
              <td>Compiles custom <code>.yar</code> rules and default threat triage rulesets (Mimikatz, PowerShell obfuscation, WebShells, Ransomware notes, Cobalt Strike beacons) with byte/regex pattern matching.</td>
            </tr>
            <tr>
              <td><code>pcap.analyze</code></td>
              <td><strong style={{ color: "#67e8f9" }}>Wireshark / Zeek</strong></td>
              <td>Libpcap parser (Ethernet, IPv4, TCP/UDP headers), flow conversation reconstruction, DNS request extraction, and automated detection of C2 beacon ports (4444, 1337, 8888, 7070, 50050, 9999).</td>
            </tr>
            <tr>
              <td><code>registry.parse</code></td>
              <td><strong style={{ color: "#f472b6" }}>Eric Zimmerman RECmd / Harlan Carvey RegRipper</strong></td>
              <td>Windows registry hive and <code>.reg</code> text parser extracting Auto-Start Extensibility Points (ASEPs: Run, RunOnce), UserAssist execution tracking with ROT13 deciphering, and USBSTOR connected devices.</td>
            </tr>
            <tr>
              <td><code>prefetch.extract</code></td>
              <td><strong style={{ color: "#fde047" }}>Eric Zimmerman PECmd</strong></td>
              <td>Parses Windows SCCA binary prefetch headers across NT versions (XP, Vista/7, 8.1, 10/11), decompresses MAM XPRESS Huffman archives, extracts UTF-16LE executable names, run counts, and 64-bit FILETIME execution histories.</td>
            </tr>
            <tr>
              <td><code>events.merge</code> / <code>timeline.build</code></td>
              <td><strong style={{ color: "#86efac" }}>Plaso / log2timeline</strong></td>
              <td>Extracts timestamped events across diverse artifacts into a unified supertimeline with deduplication and strict chronological ordering.</td>
            </tr>
            <tr>
              <td><code>files.list</code> / <code>metadata.extract</code></td>
              <td><strong style={{ color: "#93c5fd" }}>The Sleuth Kit (TSK)</strong></td>
              <td>Deterministic filesystem traversal, file namespace metadata extraction (archive inspection, image dimensions, PE headers), and SHA-256 integrity verification.</td>
            </tr>
            <tr>
              <td><code>correlate</code></td>
              <td><strong style={{ color: "#d8b4fe" }}>Sigma Rules / Splunk SPL</strong></td>
              <td>Cross-correlates anomalous execution events, suspicious archive members, network C2 beacons, registry persistence, and YARA hits into structured threat findings.</td>
            </tr>
            <tr>
              <td><code>memory.analyze</code></td>
              <td><strong style={{ color: "#f43f5e" }}>Volatility 3 Specification</strong></td>
              <td>Scans volatile RAM dumps (.raw, .dmp, .vmem), extracts EPROCESS process listings, identifies DKOM unlinked processes (ActiveProcessLinks evasion), detects RWX code injection & shellcode stagers (Cobalt Strike / Metasploit), and flags anomalous parent-child lineages.</td>
            </tr>
            <tr>
              <td><code>evtx.parse</code></td>
              <td><strong style={{ color: "#38bdf8" }}>Eric Zimmerman EvtxECmd</strong></td>
              <td>Parses Windows Event Logs (.evtx) extracting critical security events: Process Creation (4688), Successful/Failed Logons (4624/4625), Service Installation (7045), and Anti-Forensic Audit Log Cleared (1102).</td>
            </tr>
            <tr>
              <td><code>hash.verify</code></td>
              <td><strong style={{ color: "#34d399" }}>NIST SP 800-86 Specification</strong></td>
              <td>Performs cryptographic evidence integrity audits comparing SHA-256 digests against chain-of-custody baselines to generate certified verification reports.</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. Visual Building Blocks Integration */}
      <section className="docs-section">
        <h2>3. Visual Building Blocks Workflow Builder</h2>
        <p>
          The <strong>Building Blocks</strong> view provides a graphical DAG interface for constructing forensic workflows visually:
        </p>
        <ul style={{ paddingLeft: "20px", color: "#cbd5e1", lineHeight: 1.8, fontSize: "12px" }}>
          <li><strong>Top-to-Bottom Flow:</strong> Cards feature Top Input Ports (for dependency inputs) and Bottom Output Ports (for emitting results).</li>
          <li><strong>Drag-to-Connect Wires:</strong> Click and drag from any bottom port and drop onto another block to create connections without typing variable names manually.</li>
          <li><strong>Multi-Source Evidence:</strong> Import nodes support adding multiple directories via the inline <code>+ Add Source</code> button.</li>
          <li><strong>Block Details Inspector:</strong> Clicking any node opens the right-side inspector to configure forensic flags (SHA-256, timestamps, extended attributes, filter extensions, export destinations) and run individual operations.</li>
          <li><strong>Bidirectional Synchronization:</strong> All visual actions automatically generate clean, formatted JOCKY code in real time.</li>
        </ul>
      </section>

      {/* 4. Dual Graph & Forensic Lineage */}
      <section className="docs-section">
        <h2>4. Dual-Engine Forensic Graph Navigation</h2>
        <p>
          Evidra provides two specialized graph views to verify investigation execution:
        </p>
        <ul style={{ paddingLeft: "20px", color: "#cbd5e1", lineHeight: 1.8, fontSize: "12px" }}>
          <li><strong>Pipeline View:</strong> Visualizes horizontal execution lanes for each script. Clicking any step node opens the <em>Step Details Drawer</em> showing duration, capability metadata, execution verification, and an editor shortcut.</li>
          <li><strong>Input-Output (Provenance) View:</strong> Traces end-to-end data flow across three distinct columns: Evidence Hierarchy (root folders & contributory files) &rarr; JOCKY Scripts (execution operations) &rarr; Export Artifacts (final reports and payloads).</li>
        </ul>
      </section>

      {/* 5. Complete Presentation Script */}
      <section className="docs-section">
        <h2>5. Complete Forensic Investigation Procedure</h2>
        <p>Verified end-to-end investigation procedure matching the full forensic capability pipeline:</p>
        <div className="docs-code-card">
          <button className="copy-code-floating-btn" onClick={copyScript}>
            {copiedScript ? "✓ Copied!" : "📋 Copy Script"}
          </button>
          <pre>{demoScript}</pre>
        </div>
      </section>
    </div>
  );
}
