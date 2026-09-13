import { useState } from "react";

export function Docs() {
  const [copiedScript, setCopiedScript] = useState(false);

  const demoScript = `# JOCKY Forensic Investigation Procedure
# Digital Forensics DSL

[prepare]
    source = evidence.import "C:\\\\Users\\\\XYLA\\\\Downloads\\\\Valora"
    working = copy source as "working_evidence"

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf" | ".exe" | ".png") from artifacts
    metadata = metadata.extract suspicious
    prefetch = prefetch.extract artifacts
    iocs = ioc.match artifacts

[analysis]
    events = events.extract from artifacts
    timeline = timeline.build from events
    findings = correlate(suspicious, metadata, events, prefetch, iocs)

[export]
    export findings > "./Outputs/findings.json"`;

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
              <td>Artifact discovery (<code>files.list</code>), criteria-based narrowing (<code>filter</code>, <code>files.search</code>), and normalized metadata extraction (<code>metadata.extract</code>).</td>
            </tr>
            <tr>
              <td><code>[analysis]</code></td>
              <td>Event Reconstruction &amp; Correlation</td>
              <td>Timestamped event extraction (<code>events.extract</code>), prefetch execution analysis (<code>prefetch.extract</code>), threat IOC matching (<code>ioc.match</code>), timeline sequencing (<code>timeline.build</code>), and cross-collection correlation (<code>correlate</code>).</td>
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
              <td><code>source = evidence.import "C:\\path\\evidence"</code></td>
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
              <td><code>hash working</code></td>
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
              <td><code>events.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>EventCollection</code></td>
              <td><code>events = events.extract from artifacts</code></td>
            </tr>
            <tr>
              <td><code>prefetch.extract</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>PrefetchCollection</code></td>
              <td><code>prefetch = prefetch.extract artifacts</code></td>
            </tr>
            <tr>
              <td><code>ioc.match</code></td>
              <td><code>ArtifactCollection</code></td>
              <td><code>IOCCollection</code></td>
              <td><code>iocs = ioc.match artifacts</code></td>
            </tr>
            <tr>
              <td><code>timeline.build</code></td>
              <td><code>EventCollection</code></td>
              <td><code>Timeline</code></td>
              <td><code>timeline = timeline.build from events</code></td>
            </tr>
            <tr>
              <td><code>correlate</code></td>
              <td>Multiple Collections</td>
              <td><code>FindingCollection</code></td>
              <td><code>findings = correlate(suspicious, metadata, events, prefetch, iocs)</code></td>
            </tr>
            <tr>
              <td><code>export</code></td>
              <td>Any Collection</td>
              <td><code>Export</code></td>
              <td><code>export findings &gt; "./Outputs/findings.json"</code></td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 3. Normalized Metadata Schema */}
      <section className="docs-section">
        <h2>3. Normalized Metadata Contract</h2>
        <p>
          <code>metadata.extract</code> returns a structured <code>MetadataCollection</code> populated by provider capabilities:
        </p>
        <table className="docs-table">
          <thead>
            <tr>
              <th>Namespace</th>
              <th>Target File Types</th>
              <th>Extracted Forensic Fields</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>common</code></td>
              <td>All artifacts</td>
              <td><code>name</code>, <code>relative_path</code>, <code>size_bytes</code>, <code>extension</code>, <code>sha256</code></td>
            </tr>
            <tr>
              <td><code>filesystem</code></td>
              <td>All artifacts</td>
              <td><code>modified_at</code> (ISO 8601 UTC), <code>read_only: true</code></td>
            </tr>
            <tr>
              <td><code>archive</code></td>
              <td><code>.zip</code>, compressed containers</td>
              <td><code>entries_count</code>, member listing, compressed/uncompressed sizes, encryption status, high-risk member alerts (<code>.ps1</code>, <code>.bat</code>, <code>.exe</code>, passwords)</td>
            </tr>
            <tr>
              <td><code>image</code></td>
              <td><code>.png</code>, <code>.jpg</code>, <code>.bmp</code>, <code>.gif</code></td>
              <td>Image dimensions (<code>width × height</code>), <code>aspect_ratio</code>, container format</td>
            </tr>
            <tr>
              <td><code>binary</code></td>
              <td><code>.exe</code>, <code>.dll</code>, <code>.elf</code></td>
              <td>Binary format (<code>PE/COFF</code>, <code>ELF</code>), platform, architecture (32/64-bit), magic headers</td>
            </tr>
            <tr>
              <td><code>tabular</code></td>
              <td><code>.csv</code></td>
              <td>Header column schema, row counts</td>
            </tr>
            <tr>
              <td><code>text</code></td>
              <td><code>.log</code>, <code>.txt</code>, <code>.md</code>, <code>.json</code></td>
              <td>Line counts, UTF-8 preview text snippet</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* 4. Complete Presentation Script */}
      <section className="docs-section">
        <h2>4. Live Judge Demonstration Script</h2>
        <p>Copy and run this verified end-to-end investigation procedure during the demonstration:</p>
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
