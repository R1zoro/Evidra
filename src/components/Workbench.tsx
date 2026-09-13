import { useState } from 'react';
import { Icon } from './Icon';
import { ResultEmpty } from './UI';
import { ResultCard } from './Results';
import type { RuntimeExecutionResponse } from '../api/runtimeClient';

export function Workbench({
  sourceId,
  onRun,
  response,
  onBookmarkFinding,
}: {
  sourceId?: string;
  onRun: (source: string) => Promise<RuntimeExecutionResponse>;
  response: RuntimeExecutionResponse | null;
  onBookmarkFinding: (res: RuntimeExecutionResponse["results"][number]) => void;
}) {
  const [cells, setCells] = useState([
    { label: "Source", source: `source = evidence.import "Sources/${sourceId ?? "EVID-001"}"` },
    { label: "Artifacts", source: "artifacts = files.list source" },
    { label: "Filter", source: `suspicious = filter(extension == ".zip" | ".elf") from artifacts` },
  ]);
  const [state, setState] = useState("Ready");

  const run = async (index: number) => {
    setState("Running");
    try {
      const script = `[workbench]\n${cells.slice(0, index + 1).map((c) => c.source).join("\n")}`;
      const res = await onRun(script);
      setState(res.status);
    } catch {
      setState("Failed");
    }
  };

  const latest = response?.results[response.results.length - 1];

  return (
    <div className="workbench">
      <div className="workbench-head">
        <strong>Exploratory Workbench</strong>
        <small>Interactive cells · Non-destructive hypothesis testing · {state}</small>
      </div>
      <div className="workbench-grid">
        <div className="cell-stack">
          {cells.map((cell, index) => (
            <article className="workbench-cell" key={`${cell.label}-${index}`}>
              <header>
                <span>CELL {String(index + 1).padStart(2, "0")} · {cell.label}</span>
                <button onClick={() => void run(index)}>
                  <Icon name="play" /> Run Cell
                </button>
              </header>
              <textarea
                value={cell.source}
                onChange={(event) =>
                  setCells((items) =>
                    items.map((item, position) =>
                      position === index ? { ...item, source: event.target.value } : item
                    )
                  )
                }
              />
            </article>
          ))}
          <button
            className="side-action"
            onClick={() => setCells((items) => [...items, { label: "Query", source: "# JOCKY operation" }])}
          >
            <Icon name="plus" /> Add Cell
          </button>
        </div>
        <div className="workbench-result">
          {latest ? (
            <ResultCard result={latest} context={response?.context} onBookmarkFinding={onBookmarkFinding} />
          ) : (
            <ResultEmpty />
          )}
        </div>
      </div>
    </div>
  );
}