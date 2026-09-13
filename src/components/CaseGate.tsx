import { useRef, useState, useEffect, type ChangeEvent } from "react";
import { LocalRuntimeClient } from "../api/runtimeClient";
import { Icon } from "./Icon";

export function CaseGate({ onOpen }: { onOpen: () => void }) {
  const browserFolder = useRef<HTMLInputElement>(null);
  const [recommended, setRecommended] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    browserFolder.current?.setAttribute("webkitdirectory", "");
  }, []);

  const create = async (root: string, fallbackName: string) => {
    const name = root.split(/[\\/]/).filter(Boolean).pop() || fallbackName;
    let pathHash = "0000";
    if (root) {
      let h = 0;
      for (let i = 0; i < root.length; i++) {
        h = (Math.imul(31, h) + root.charCodeAt(i)) | 0;
      }
      pathHash = Math.abs(h).toString(36).toUpperCase().slice(0, 5);
    }
    const id = `CASE-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 16).replace(/^-+|-+$/g, "") || "DEFAULT"}-${pathHash}`;
    try {
      const snapshot = await new LocalRuntimeClient().createCase({
        id,
        name,
        root,
        folders: recommended ? ["Evidence", "Analysis", "Outputs"] : [],
      });
      const persistentId = snapshot.case?.id ?? id;
      const persistentName = snapshot.case?.name ?? name;
      sessionStorage.setItem("evidra.caseId", persistentId);
      sessionStorage.setItem("evidra.caseName", persistentName);
      sessionStorage.setItem("evidra.caseRoot", root);
      onOpen();
    } catch (error) {
      setMessage(`Could not create the case: ${error instanceof Error ? error.message : "local runtime unavailable"}`);
    }
  };

  const chooseFolder = async () => {
    if (window.evidraDesktop) {
      const root = await window.evidraDesktop.chooseDirectory();
      if (root) await create(root, "New Case");
      return;
    }
    setMessage("Browser session initialized with local runtime workspace.");
    await create("", "Browser Case");
  };

  const browserChoice = (event: ChangeEvent<HTMLInputElement>) => {
    const first = event.target.files?.[0];
    if (first) void create("", first.webkitRelativePath.split("/")[0] || "Browser Case");
  };

  return (
    <main className="case-gate">
      <div className="gate-titlebar">
        <div className="gate-titlebar-title">
          <span style={{ color: "#38bdf8", fontWeight: "bold", marginRight: "6px" }}>EVIDRA</span>
          <span style={{ color: "#94a3b8", fontSize: "11px" }}>Forensic Workstation</span>
        </div>
        <div className="window-controls">
          <button
            className="window-control-btn"
            onClick={() => window.evidraDesktop?.windowControl("minimize")}
            title="Minimize"
          >
            ─
          </button>
          <button
            className="window-control-btn"
            onClick={() => window.evidraDesktop?.windowControl("maximize")}
            title="Maximize"
          >
            □
          </button>
          <button
            className="window-control-btn window-close"
            onClick={() => window.evidraDesktop?.windowControl("close")}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>
      <section className="case-gate-card">
        <div className="gate-logo">E</div>
        <div className="eyebrow">LOCAL FORENSIC WORKSPACE</div>
        <h1>Start an Evidra Case</h1>
        <p>Pick or initialize the case workspace folder. Evidra keeps metadata in a managed <code>.evidra</code> store and provides an investigator-oriented filesystem environment.</p>
        <label className="setup-option">
          <input type="checkbox" checked={recommended} onChange={(event) => setRecommended(event.target.checked)} />
          Initialize standard <code>Evidence/</code>, <code>Analysis/</code>, and <code>Outputs/</code> directories
        </label>
        <input ref={browserFolder} className="hidden-file-input" type="file" multiple onChange={browserChoice} />
        <button className="gate-primary" onClick={() => void chooseFolder()}>
          <Icon name="folder" /> Select / Initialize Case Folder
        </button>
        <button className="gate-secondary" onClick={() => void create("", "Default Case")}>
          Open Default Investigation Workspace
        </button>
        {message && <p className="gate-message">{message}</p>}
      </section>
    </main>
  );
}
