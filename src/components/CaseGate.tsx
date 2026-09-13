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
    const id = `CASE-${name.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 24).replace(/^-+|-+$/g, "") || "DEFAULT"}`;
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
