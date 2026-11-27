// Settings → personal record: Clearance Level, Merit toward the next level, the wallet, and the
// Dojo Record code that copies a career to another browser (import merges, never overwrites).
import { useId, useState } from "react";
import { careerStore, economy, walletOf } from "./career";
import type { ToastInput } from "./paper-toast-context";
import { navigate } from "./routing";
import { useCareer } from "./use-career";

const STATUS_COPY = {
  unavailable: "This browser is not keeping records (storage is blocked or private), so there is no career to show. The Card Library and every table use Open Dojo.",
  everything: "This build of Paper-Fu unlocks everything, so there are no levels, tickets or packs.",
} as const;

export function CareerRecord({ onToast }: { onToast: (toast: ToastInput) => void }) {
  const career = useCareer();
  const [code, setCode] = useState("");
  const [incoming, setIncoming] = useState("");
  const [busy, setBusy] = useState(false);
  const exportId = useId();
  const importId = useId();
  const state = career.state;

  if (!state || career.status === "unavailable" || career.status === "everything") {
    return <section className="settings-section paper-stack career-record" aria-labelledby="career-record-title">
      <div className="settings-section-heading"><div><span className="eyebrow">06 / Dojo Record</span><h2 id="career-record-title">Career on file</h2><p>{STATUS_COPY[career.status === "everything" ? "everything" : "unavailable"]}</p></div></div>
    </section>;
  }

  const progress = economy.levelProgress(state.merit);
  const diploma = economy.diplomaFor(progress.level);
  const wallet = walletOf(state);
  const owned = economy.ownedCards(state).size;
  const percent = progress.span ? Math.round((progress.into / progress.span) * 100) : 100;
  const readOnly = career.status === "read-only";

  const makeCode = async () => {
    setBusy(true);
    try {
      const next = await careerStore.exportCode();
      setCode(next ?? "");
      try { await navigator.clipboard?.writeText(next ?? ""); onToast({ kind: "stamp", eyebrow: "Dojo Record", title: "Code copied", message: "Paste it into Settings on another browser to bring your career along.", duration: 3600 }); }
      catch { onToast({ kind: "note", eyebrow: "Dojo Record", title: "Code ready", message: "Select the code and copy it.", duration: 3200 }); }
    } finally { setBusy(false); }
  };

  const mergeCode = async () => {
    setBusy(true);
    try {
      const { before, after } = await careerStore.importCode(incoming);
      setIncoming("");
      const gained = after && before ? economy.ownedCards(after).size - economy.ownedCards(before).size : 0;
      onToast({ kind: "stamp", eyebrow: "Dojo Record", title: "Record merged", message: `Nothing was lost. ${gained > 0 ? `${gained} new cards filed. ` : ""}Clearance Level ${economy.levelFor(after?.merit ?? 0)}.`, duration: 4200 });
    } catch (error) {
      onToast({ kind: "warning", eyebrow: "Dojo Record", title: "Could not read that code", message: error instanceof Error ? error.message : "Copy it again in one piece.", duration: 4200 });
    } finally { setBusy(false); }
  };

  return <section className="settings-section paper-stack career-record" aria-labelledby="career-record-title">
    <div className="settings-section-heading"><div><span className="eyebrow">06 / Dojo Record</span><h2 id="career-record-title">Career on file</h2><p>Merit from every match raises your Clearance Level, which opens booster series and clears new fighters and Bosses. It lives in this browser; copy the code below to keep a backup or move it.</p></div><div className="career-record-diploma" aria-hidden="true"><span>{diploma.name}</span><b>{progress.level}</b><small>Clearance</small></div></div>
    {career.restoredFromBackup && <p className="career-record-note">The last save was damaged, so your career was restored from its backup.</p>}
    {readOnly && <p className="career-record-note">This record was saved by a newer version of Paper-Fu. It is shown read-only and never overwritten; you can still export it.</p>}
    <div className="career-record-level">
      <div><strong>Clearance Level {progress.level}</strong><span>{state.merit.toLocaleString()} Merit{progress.next !== null ? ` · ${(progress.next - state.merit).toLocaleString()} to ${progress.maxed ? "the next bonus ticket" : `level ${progress.level + 1}`}` : ""}</span></div>
      <span className="career-record-meter" role="meter" aria-label={progress.maxed ? "Merit toward the next bonus ticket" : `Merit toward Clearance Level ${progress.level + 1}`} aria-valuemin={0} aria-valuemax={progress.span || 1} aria-valuenow={progress.span ? progress.into : 1}><i style={{ width: `${percent}%` }} /></span>
    </div>
    <dl className="career-record-facts">
      <div><dt>{wallet.tickets}</dt><dd>Booster Tickets</dd></div>
      <div><dt>{wallet.stubs}/{wallet.stubRate}</dt><dd>Ticket Stubs</dd></div>
      <div><dt>{owned}</dt><dd>cards owned</dd></div>
      <div><dt>{state.stats.wins}–{state.stats.losses}</dt><dd>wins–losses</dd></div>
    </dl>
    <div className="career-record-actions"><button type="button" className="button ghost" onClick={() => navigate({ page: "cards" })}>Open the Card Library <span aria-hidden="true">→</span></button><span>{state.openDojo ? "Open Dojo is on: matches use every card and earn nothing." : "My Collection is on: matches use your cards and pay Merit."}</span></div>
    <div className="career-record-codes">
      <div className="career-record-code">
        <label htmlFor={exportId}>Export: your Dojo Record code</label>
        <textarea id={exportId} readOnly value={code} placeholder="Press the button to file a code." rows={3} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" className="button primary" onClick={makeCode} disabled={busy}>Copy my Dojo Record code</button>
      </div>
      <div className="career-record-code">
        <label htmlFor={importId}>Import: paste a code to merge</label>
        <textarea id={importId} value={incoming} onChange={(event) => setIncoming(event.target.value)} placeholder="PFC1.…" rows={3} spellCheck={false} />
        <button type="button" className="button ghost" onClick={mergeCode} disabled={busy || readOnly || !incoming.trim()}>Merge this record</button>
        <small>Importing merges: cards and kits are combined and the higher Merit is kept. It never removes anything.</small>
      </div>
    </div>
  </section>;
}
