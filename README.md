# Evidra

Evidra is a local-first digital forensic investigation environment built around JOCKY, a compact domain-specific language for expressing forensic intent.

An analyst describes what should be examined—such as evidence sources, artifacts, metadata, events, integrity records, correlations, and exports—while Evidra resolves how those operations can be performed through approved capabilities and providers. The result is a repeatable investigation workspace where evidence, intermediate results, findings, and provenance remain connected.

## Product direction

Evidra is designed as a desktop-oriented forensic workstation rather than a generic dashboard. Its main workspace combines:

- a case and evidence explorer;
- a JOCKY procedure editor;
- an exploratory Workbench for temporary analysis;
- typed Results Explorer views;
- timeline and correlation graph views;
- Building Blocks generated from the shared Investigation IR;
- run status, provenance, and integrity information.

The prototype is local-first and offline by default. It begins with acquired or synthetic evidence and focuses on examination, analysis, correlation, repeatability, and evidence integrity. Electron packaging is planned as a Windows-first desktop shell around the same client and local runtime boundaries.

## Architecture direction

```text
JOCKY source
    -> parser / AST
    -> Investigation IR
    -> capability and policy planning
    -> provider or platform adapter
    -> typed result
    -> case graph and provenance
    -> Evidra workstation / export
```

The client is built with React and TypeScript. The JOCKY runtime is planned in Python, with SQLite for portable case metadata and the local filesystem for evidence and materialized outputs. Providers may use native APIs, Python libraries, or specialist forensic tools behind explicit capability contracts.

## JOCKY v0.1 direction

The current provisional language includes named investigation stages, assignment with `=`, source selection with `from`, materialization with `>`, general filtering, and capabilities such as `copy`, `hash`, `files.list`, `metadata.extract`, `events.extract`, `correlate`, and `export`. See [`docs/JOCKY_V0_1.md`](docs/JOCKY_V0_1.md) for the working semantics and rerun rules.

## Development

Install dependencies:

```powershell
npm install
```

Start the client:

```powershell
npm run dev
```

Run the bundled type-check and production build verification:

```powershell
npm run check
```

## Future additions

The architecture is intended to grow toward Windows and Ubuntu providers, portable case packages, replayable investigations, richer timeline and graph analysis, specialist-tool adapters, editable visual workflows, signed procedures, investigation diffs, controlled live-source providers, and Electron packaging that supervises the local runtime.
