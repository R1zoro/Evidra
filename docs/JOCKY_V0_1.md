# JOCKY v0.1 - Provisional Language Contract

Status: provisional design baseline. The contract may evolve as forensic use cases are validated.

## Purpose

JOCKY is a domain-specific language for expressing forensic investigation intent. It is not a general-purpose shell or operating-system command wrapper.

## Core constructs

### Named stages

```jocky
[prepare]
[examine]
[analysis]
[export]
```

Stages are semantic groupings. They are not functions and do not create a separate execution engine.

### Assignment

```jocky
artifacts = files.list working
```

`=` binds an operation result to a named result reference. A result reference can be consumed by later operations.

### Sources

```jocky
events = events.extract from artifacts
```

`from` identifies the source of a capability operation or filter.

### Materialization

```jocky
export findings > "./outputs/findings.json"
```

`>` materializes or sends a result to a destination. It is not a shell byte-stream pipe.

### Filtering

```jocky
suspicious = filter(extension == ".zip" | ".elf") from artifacts
```

The first implementation supports grouped predicates with `|` for alternatives and `&` for conjunctions. Additional operators should be added only when supported by a documented forensic use case.

## Prototype capabilities

```text
evidence.import
copy
hash
hash.verify
files.list
files.search
files.inspect
filter
metadata.extract
prefetch.extract
pcap.analyze
registry.parse
ioc.match
events.extract
events.merge
yara.scan
timeline.build
correlate
export
```

## Execution semantics

- A procedure is parsed into an AST, then lowered into a platform-neutral Investigation IR.
- Each operation has an explicit input, output type, capability, provider, and provenance record.
- Runs are sequential for the prototype, while the model preserves dependency information.
- Independent operations may continue after an unrelated failure.
- Dependent operations are blocked when an input is invalid, missing, or denied.
- Successful results are persisted; a failed later operation does not roll back earlier results.
- Every procedure execution creates a new run record.
- Normal reruns never overwrite a previous run or its outputs.
- Status values are distinct: `queued`, `running`, `completed`, `failed`, `denied`, `partial`, and `blocked`.

## Evidence semantics

`evidence.import` registers an external source. `copy` creates a non-destructive working derivative. Hashes are integrity records, not a complete chain of custody. Case provenance records inputs, outputs, operation, provider, timestamps, and relationships.

## Tool Lineage and Industry Standards Attribution

Evidra and JOCKY formalize standard forensic methodologies by implementing and attributing core capabilities directly to industry-standard tooling:

| Capability | Originating Tool / Standard | Forensic Scope & Implementation |
| :--- | :--- | :--- |
| `yara.scan` | **VirusTotal YARA** | Native libyara & pure-Python regex/byte signature matching engine. Compiles custom `.yar` rules or runs built-in threat triage rulesets (Mimikatz, PowerShell obfuscation, WebShells, Ransomware notes, Cobalt Strike beacons) against raw files and memory dumps. |
| `pcap.analyze` | **Wireshark / Zeek Specification** | Binary Libpcap parser supporting little/big-endian files, Ethernet frames, IPv4, TCP/UDP headers, conversation flow extraction, DNS queries (UDP 53), and automated detection/flagging of C2 beacon ports (4444, 1337, 8888, 7070, 50050, 9999). |
| `registry.parse` | **Eric Zimmerman's RECmd / Harlan Carvey's RegRipper** | Windows registry hive and `.reg` export parser extracting Auto-Start Extensibility Points (ASEPs: Run, RunOnce), UserAssist execution history with ROT13 deciphering, and USBSTOR connected storage hardware tracking. |
| `prefetch.extract` / `artifacts.parse_prefetch` | **Eric Zimmerman's PECmd** | Windows SCCA prefetch header parsing across all NT versions (v17 Windows XP, v23 Vista/7, v26 Windows 8.1, v30 Windows 10/11), MAM XPRESS Huffman decompression, UTF-16LE executable name extraction, prefetch hash, run counts, and 64-bit FILETIME execution histories. |
| `events.extract`, `events.merge`, `timeline.build` | **Plaso / log2timeline** | Unified multi-source event extraction, supertimeline synthesis, deduplication, and chronological sorting across filesystem, log, and browser artifacts. |
| `files.list`, `metadata.extract`, `hash` | **The Sleuth Kit (TSK)** | Deterministic forensic artifact discovery, filesystem namespace extraction (archive inspection, image dimensions, PE headers), and cryptographic integrity hashing. |
| `correlate` | **Sigma & Splunk SPL** | Rule-based cross-artifact correlation matrix mapping anomalous command execution, suspicious archives, network C2 beacons, registry persistence, and YARA hits into structured threat findings. |

## Prototype exclusions

The v0.1 runtime does not implement operational security-control evasion, vulnerable-driver exploitation, covert transport, full disk acquisition, advanced memory acquisition, or a native LLVM backend.

