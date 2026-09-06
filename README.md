# Evidra

Evidra is a local-first digital forensic investigation environment for examining acquired evidence through a repeatable, analyst-oriented workflow. It combines a case workspace, evidence explorer, JOCKY procedure editor, exploratory Workbench, typed result viewers, provenance, timeline analysis, correlation, and export paths in one desktop-oriented application.

Evidra is designed for investigators who need to describe an examination once, run it against an authorized evidence source, inspect structured results, and understand how each observation supports a finding. The platform is intentionally not a generic dashboard or a shell wrapper. Its interface is organized like a professional investigation workstation: evidence and procedures remain visible while results, operations, and relationships can be inspected in context.

## Product direction

The first release is Windows-ready and local/offline by default. It begins after evidence acquisition and focuses on examination and analysis of synthetic or imported evidence. A portable case can contain its own metadata, procedures, run history, provenance, integrity records, outputs, and references to evidence sources.

The product is organized around five promises:

1. An analyst has a managed case.
2. Evidence can be registered and examined without losing its identity.
3. A repeatable investigation can be written in JOCKY.
4. JOCKY produces structured, typed forensic results.
5. Results remain connected to their evidence, operations, and findings.

The durable Procedure and the exploratory Workbench are separate concepts. A Procedure records repeatable investigation logic. The Workbench supports temporary cells and intermediate-result exploration without forcing every experiment into the permanent procedure.

## JOCKY language

JOCKY is a small domain-specific language for forensic intent. It describes the analyst-level operation rather than a Windows command, Linux command, Python library, or specialist-tool invocation. Providers determine how an approved capability is implemented.

The current provisional v0.1 contract supports:

```jocky
[prepare]
    working = copy EVID-001 as "working_evidence"
    hash working

[examine]
    artifacts = files.list working
    suspicious = filter(extension == ".zip" | ".elf") from artifacts
    metadata = metadata.extract suspicious

[analysis]
    events = events.extract from artifacts
    findings = correlate(suspicious, metadata, events)

[export]
    export findings > "./outputs/findings.json"
```

### v0.1 semantics

- `[stage]` creates a named semantic investigation stage; it is not a function.
- `=` binds an operation result to a named reference.
- `from` identifies the source of an operation or filter.
- `>` materializes or sends a result to a destination; it is not an arbitrary shell pipe.
- `filter(...)` is a general operation over typed collections.
- `|` expresses alternatives and `&` expresses conjunctions inside filter expressions.
- Procedures are parsed into an AST and lowered into a platform-neutral Investigation IR.
- Runs are sequential initially, but dependencies are recorded so independent work can continue after an unrelated failure.
- Dependent operations become `blocked` when required inputs are missing, invalid, or denied.
- Every rerun creates a new run record. Previous results are not silently overwritten.
- Statuses include `queued`, `running`, `completed`, `failed`, `denied`, `partial`, and `blocked`.

The detailed contract is maintained in [`docs/JOCKY_V0_1.md`](docs/JOCKY_V0_1.md). The language is deliberately provisional and should gain syntax only when a real forensic use case justifies it.

## Core capabilities

The initial capability catalogue is organized by analyst need rather than implementation technology:

| Area | Capabilities | Typical result |
| --- | --- | --- |
| Evidence | `evidence.import`, `copy` | Evidence or working-derivative record |
| Integrity | `hash`, `hash.verify` | Integrity record |
| Artifacts | `files.list`, `files.search`, `files.inspect`, `filter` | ArtifactCollection |
| Metadata | `metadata.extract` | MetadataCollection |
| Events | `events.extract`, `events.merge` | EventCollection |
| Timeline | `timeline.build` | Timeline |
| Analysis | `correlate` | Relationships and findings |
| Output | `export` | Materialized JSON, CSV, text, or supported file output |

Each capability declares its inputs, outputs, required capability, provider, status, and provenance. The UI can then choose a suitable result renderer instead of displaying every operation as undifferentiated console text.

## Typed Results Explorer

The Workbench is a universal investigation surface for intermediate results. A capability returns a typed result and Evidra selects a compatible view:

```text
ArtifactCollection  -> artifact tree/table/details
MetadataCollection  -> structured metadata viewer
EventCollection     -> event table/timeline
Timeline            -> timeline viewer
ProcessCollection   -> process table/details
PacketCollection    -> packet table/details/raw output
HashRecord          -> integrity viewer
Text/File result    -> text, JSON, file, or raw-output viewer
Unknown result      -> safe raw/JSON fallback
```

Every result keeps a common context: result ID, operation, input, provider, timestamp, status, and provenance. Structured output and original provider output can coexist, so normalization never has to discard specialist-tool data.

## Architecture

```text
JOCKY source
    -> lexer / parser
    -> AST
    -> Investigation IR
    -> capability and policy planning
    -> provider or platform adapter
    -> normalized typed result
    -> case graph and provenance
    -> Evidra client / export
```

The current application is split conceptually into:

- `client/`: React and TypeScript workstation interface;
- `runtime/`: planned Python JOCKY parser, IR, execution, and forensic processing;
- `contracts/`: shared case, evidence, operation, result, and provenance schemas;
- `providers/`: native, library, and specialist-tool adapters behind capability contracts;
- `cases/`: portable case packages and controlled synthetic evidence;
- `desktop/`: future Electron shell and Windows packaging layer.

The prototype uses React/TypeScript for fast, componentized UI work and Python for the language/runtime and forensic data ecosystem. SQLite is the planned local case store. The filesystem stores evidence references and materialized outputs. Electron will later package and supervise the local Python process without changing the renderer’s application boundary.

## Current interface

The application currently presents:

- a VS Code-inspired activity bar and case explorer;
- a JOCKY procedure editor as the primary investigation surface;
- an exploratory Workbench with cells and scrollable typed-result previews;
- artifact, metadata, event, finding, and graph entry points;
- a read-only Building Blocks view generated from the investigation flow;
- run status, operation states, and provenance context;
- a Help/documentation placeholder for the future capability reference.

The correlation graph is intentionally treated as a separate workspace tool. Future graph modes may include object lineage, input-to-output mapping, analyst-defined correlation, and case-wide relationship views.

## Future work

Planned extensions include:

- real JOCKY parsing, validation, and Investigation IR execution;
- SQLite-backed portable case packages and preserved run history;
- Windows providers followed by Ubuntu providers;
- richer metadata namespaces and normalized timeline events;
- typed renderers for processes, packets, memory observations, and specialist-tool output;
- object, result, and case-wide graph scopes;
- editable visual Building Blocks synchronized with JOCKY through the shared IR;
- capability negotiation and policy-aware alternate provider plans;
- replayable investigations, evidence capsules, investigation diffs, and signed procedures;
- controlled authorized live-source providers and fleet orchestration;
- Electron Windows packaging, runtime supervision, and later cross-platform packaging;
- analyst-authored reporting and organization-specific report templates.

Operational security-control evasion, vulnerable-driver exploitation, covert transport, and offensive endpoint bypass are outside the safe prototype implementation boundary.

## Running Evidra

Install the frontend dependencies:

```powershell
npm install
```

Start the development client:

```powershell
npm run dev
```

Run the bundled type-check and production-build verification:

```powershell
npm run check
```

The current UI is a local client shell while the Python runtime boundary is being built. The intended end state is a local Evidra application that opens a case, loads a JOCKY procedure, executes it through approved providers, persists each run, and presents structured results with traceable provenance.
