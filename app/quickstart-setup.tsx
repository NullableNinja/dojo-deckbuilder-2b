// Quick Start "Set the table" checklist: tick each setup step at the real table; when every box is
// ticked the panel is stamped TABLE READY. Presentation only; the steps come from the rulebook.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prefersReducedMotion, usePaperToast } from "./paper-toast-context";
import "./quickstart-setup.css";

// Setup is for tonight's game, so ticks last for this browser session only.
const SETUP_STORAGE_KEY = "paper-fu-quickstart-setup";

function readTicks(count: number) {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(SETUP_STORAGE_KEY) ?? "[]");
    return new Set<number>(Array.isArray(parsed) ? parsed.filter((value): value is number => Number.isInteger(value) && value >= 0 && value < count) : []);
  } catch {
    return new Set<number>();
  }
}

export function QuickstartSetup({ steps, onPlay, children }: { steps: string[]; onPlay: () => void; children?: ReactNode }) {
  const [ticked, setTicked] = useState<Set<number>>(() => readTicks(steps.length));
  const [freshlyReady, setFreshlyReady] = useState(false);
  const pushToast = usePaperToast();
  const ready = ticked.size === steps.length;
  const wasReady = useRef(ready);
  useEffect(() => {
    try { window.sessionStorage.setItem(SETUP_STORAGE_KEY, JSON.stringify([...ticked])); } catch { /* storage blocked: ticks last this visit */ }
    if (ready && !wasReady.current) {
      setFreshlyReady(!prefersReducedMotion());
      pushToast({ kind: "stamp", eyebrow: "Setup complete", title: "Table ready", message: "Every item filed. Somebody say HIYAH.", duration: 3200 });
    }
    wasReady.current = ready;
  }, [ticked, ready]);
  const toggle = (index: number) => setTicked((current) => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index); else next.add(index);
    return next;
  });

  return <section className={`paper-panel setup-panel paper-stack quickstart-step-block${ready ? " is-table-ready" : ""}`} id="quickstart-setup">
    <div className="quickstart-step-heading">
      <span className="step-stamp">01</span>
      <div><span className="eyebrow">Set the table</span><h2>{steps.length} things before the first HIYAH</h2><p>Tick each one at the real table. The Department will notice when you are done.</p></div>
      <span className={`quickstart-step-status setup-status${ready ? " is-ready" : ""}${freshlyReady ? " is-fresh" : ""}`} role="status">{ready ? <>Table<br />ready</> : <>{ticked.size} / {steps.length}<br />filed</>}</span>
    </div>
    <span className="setup-meter" aria-hidden="true"><i style={{ width: `${(ticked.size / steps.length) * 100}%` }} /></span>
    <ol className="setup-list setup-checklist">{steps.map((item, index) => <li key={index} className={ticked.has(index) ? "is-ticked" : undefined}>
      <label>
        <input type="checkbox" checked={ticked.has(index)} onChange={() => toggle(index)} />
        <span className="setup-box" aria-hidden="true">{ticked.has(index) ? "✓" : String(index + 1).padStart(2, "0")}</span>
        <p>{item}</p>
      </label>
    </li>)}</ol>
    {ready && <div className="setup-ready-bar"><p><b>Table ready.</b> Deal the hands, or practice a round against the computer first.</p><div><button type="button" className="button primary" onClick={onPlay}>Practice a round <span aria-hidden="true">→</span></button><button type="button" className="button ghost" onClick={() => setTicked(new Set())}>Clear the table</button></div></div>}
    {children}
  </section>;
}
