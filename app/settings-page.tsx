"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { AVATAR_IMAGES } from "./avatar-catalog";
import { ACCENT_OPTIONS, AVATAR_OPTIONS, DEFAULT_USER_PREFERENCES, type AccentKey, type AvatarKey, type PresentationPreferences } from "./user-preferences";

type Theme = "light" | "dark";

type SettingsPageProps = {
  theme: Theme;
  accent: AccentKey;
  displayName: string;
  avatar: AvatarKey;
  presentationPreferences: PresentationPreferences;
  onToggleTheme: () => void;
  onAccentChange: (accent: AccentKey) => void;
  onNameChange: (name: string) => void;
  onAvatarChange: (avatar: AvatarKey) => void;
  onPresentationPreferencesChange: (preferences: Partial<PresentationPreferences>) => void;
  onToast: (toast: { kind?: "note" | "success" | "warning" | "stamp" | "critical"; eyebrow?: string; title: string; message?: string; duration?: number }) => void;
};

const ACCENT_HEX: Record<AccentKey, string> = {
  ember: "#c84c35",
  crimson: "#b20d30",
  "hot-pink": "#d62d70",
  cobalt: "#3f65a6",
  brass: "#b57d18",
  plum: "#79568c",
  guard: "#377b7d",
};
function SettingChoice({ label, detail, selected, onClick }: { label: string; detail: string; selected: boolean; onClick: () => void }) {
  return <button type="button" className={`settings-choice${selected ? " is-selected" : ""}`} aria-pressed={selected} onClick={onClick}><strong>{label}</strong><span>{detail}</span>{selected && <b aria-hidden="true">✓</b>}</button>;
}

export default function SettingsPage({ theme, accent, displayName, avatar, presentationPreferences, onToggleTheme, onAccentChange, onNameChange, onAvatarChange, onPresentationPreferencesChange, onToast }: SettingsPageProps) {
  const [savedNotice, setSavedNotice] = useState("Profile loaded from this browser.");
  const selectedAccent = useMemo(() => ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0], [accent]);

  useEffect(() => setSavedNotice("Saved locally · this dojo remembers"), [presentationPreferences]);

  const chooseAccent = (next: AccentKey) => {
    onAccentChange(next);
    setSavedNotice("Accent filed · every page gets the memo");
  };

  const resetPreferences = () => {
    onPresentationPreferencesChange({
      density: DEFAULT_USER_PREFERENCES.density,
      reducedMotion: DEFAULT_USER_PREFERENCES.reducedMotion,
      toastDuration: DEFAULT_USER_PREFERENCES.toastDuration,
      effectIntensity: DEFAULT_USER_PREFERENCES.effectIntensity,
      displayFace: DEFAULT_USER_PREFERENCES.displayFace,
    });
    onAccentChange(DEFAULT_USER_PREFERENCES.accent);
    setSavedNotice("Defaults restored · the clipboard has been politely reset");
    onToast({ kind: "stamp", eyebrow: "Personal settings", title: "Defaults restored", message: "The Department has returned your dojo to Ember standard.", duration: 3200 });
  };

  return <main className="page-shell shell settings-page" aria-labelledby="settings-title">
    <header className="settings-hero paper-stack">
      <div className="settings-hero-copy"><span className="eyebrow">Paper-Fu / Personal filing</span><h1 id="settings-title">Your dojo.<br /><em>Your rules.</em></h1><p>Set the way Paper-Fu speaks, moves, and throws a paper airplane at your screen. These preferences stay in this browser and travel across the whole website.</p><span className="settings-saved"><i aria-hidden="true" />{savedNotice}</span></div>
      <div className="settings-hero-art" aria-hidden="true"><span className="settings-form-number">FORM 00·YOU</span><strong>STYLE<br />AUTHORITY</strong><b>APPROVED</b><i /></div>
    </header>

    <section className="settings-section paper-stack" aria-labelledby="profile-settings-title">
      <div className="settings-section-heading"><div><span className="eyebrow">00 / Agent identity</span><h2 id="profile-settings-title">File your field agent</h2><p>Give the dojo a name to use sparingly in welcomes, receipts, and the occasional official side-eye. Pick a face while you are here.</p></div><div className="settings-profile-badge"><img src={AVATAR_IMAGES[avatar]} alt="" /><span><small>Current agent</small><strong>{displayName || "Paper-Fu Agent"}</strong></span></div></div>
      <label className="settings-name-field"><span>Display name</span><input value={displayName} maxLength={36} onChange={(event) => onNameChange(event.target.value)} placeholder="Paper-Fu Agent" /><small>Stored locally. The Department cannot send you a newsletter because it does not know how.</small></label>
      <div className="settings-avatar-grid" role="radiogroup" aria-label="Choose your Paper-Fu avatar">{AVATAR_OPTIONS.map((option) => <button key={option.id} type="button" className={`settings-avatar-choice${avatar === option.id ? " is-selected" : ""}`} role="radio" aria-checked={avatar === option.id} onClick={() => onAvatarChange(option.id)}><img src={AVATAR_IMAGES[option.id]} alt="" /><span><strong>{option.label}</strong><small>{option.quip}</small></span>{avatar === option.id && <b aria-hidden="true">✓</b>}</button>)}</div>
    </section>

    <section className="settings-section paper-stack" aria-labelledby="accent-title">
      <div className="settings-section-heading"><div><span className="eyebrow">01 / House colors</span><h2 id="accent-title">Pick your accent</h2><p>The accent travels through buttons, stamps, route transitions, progress marks, and the little moments that say “this is yours.” Severity colors still keep their meaning where the interface needs them to.</p></div><div className="settings-current-swatch" style={{ "--settings-swatch": ACCENT_HEX[accent] } as CSSProperties}><i aria-hidden="true" /><span>Current filing<strong>{selectedAccent.label}</strong></span></div></div>
      <div className="accent-grid" role="radiogroup" aria-label="Website accent color">
        {ACCENT_OPTIONS.map((option) => <button key={option.id} type="button" className={`accent-choice accent-choice--${option.id}${accent === option.id ? " is-selected" : ""}`} role="radio" aria-checked={accent === option.id} onClick={() => chooseAccent(option.id)}><span className="accent-choice-swatch" aria-hidden="true" /><span className="accent-choice-copy"><strong>{option.label}</strong><small>{option.shortLabel}</small><em>{option.description}</em></span>{accent === option.id && <b className="accent-choice-mark" aria-hidden="true">✓</b>}</button>)}
      </div>
      <div className="settings-accent-preview"><div><span className="settings-preview-label">Live preview</span><strong>Stamp your own filing</strong><p>The selected accent shows up here immediately, in both lighting conditions.</p></div><div className="settings-preview-actions"><button type="button" className="button primary" onClick={() => onToast({ kind: "stamp", eyebrow: "Accent preview", title: `${selectedAccent.label} is on the case`, message: "The color has been authorized across the website.", duration: 3200 })}>Test accent</button><span className="settings-preview-stamp">{selectedAccent.shortLabel}</span></div></div>
    </section>

    <div className="settings-columns">
      <section className="settings-section paper-stack" aria-labelledby="lighting-title">
        <div className="settings-section-heading"><div><span className="eyebrow">02 / Lighting department</span><h2 id="lighting-title">Choose the dojo hour</h2><p>Light and dark are both first-class Paper-Fu tables. Pick the one that makes your paperwork look most dangerous.</p></div></div>
        <div className="settings-choice-grid settings-choice-grid--theme"><SettingChoice label="Daylight dojo" detail="Paper, pigment, open play" selected={theme === "light"} onClick={() => theme !== "light" && onToggleTheme()} /><SettingChoice label="After-hours dojo" detail="Ink, brass, quiet focus" selected={theme === "dark"} onClick={() => theme !== "dark" && onToggleTheme()} /></div>
      </section>

      <section className="settings-section paper-stack" aria-labelledby="motion-title">
        <div className="settings-section-heading"><div><span className="eyebrow">03 / Motion protocol</span><h2 id="motion-title">Control the theatrics</h2><p>Keep the meaning, turn down the spectacle. This setting affects the shared interaction language.</p></div></div>
        <div className="settings-choice-grid"><SettingChoice label="Full HIYAH!" detail="Shake, burst, and cannon" selected={!presentationPreferences.reducedMotion} onClick={() => onPresentationPreferencesChange({ reducedMotion: false })} /><SettingChoice label="Quiet technique" detail="No motion theatrics" selected={presentationPreferences.reducedMotion} onClick={() => onPresentationPreferencesChange({ reducedMotion: true })} /></div>
      </section>
    </div>

    <section className="settings-section paper-stack" aria-labelledby="rhythm-title">
      <div className="settings-section-heading"><div><span className="eyebrow">04 / Interface rhythm</span><h2 id="rhythm-title">Tune the tempo</h2><p>These preferences travel with your profile so the website keeps the same rhythm wherever you go.</p></div></div>
      <div className="settings-control-grid">
        <label className="settings-control"><span>Paper density</span><select value={presentationPreferences.density} onChange={(event) => onPresentationPreferencesChange({ density: event.target.value as PresentationPreferences["density"] })}><option value="roomy">Roomy paper</option><option value="tight">Tight filing</option></select><small>How much breathing room the interface keeps between papers.</small></label>
        <label className="settings-control"><span>Default toast duration</span><select value={presentationPreferences.toastDuration} onChange={(event) => onPresentationPreferencesChange({ toastDuration: event.target.value as PresentationPreferences["toastDuration"] })}><option value="1800">Quick · 1.8 seconds</option><option value="4200">Standard · 4.2 seconds</option><option value="9000">Long · 9 seconds</option></select><small>Hover or focus pauses the timer. Preview notices may use a custom length.</small></label>
        <label className="settings-control"><span>Impact intensity</span><select value={presentationPreferences.effectIntensity} onChange={(event) => onPresentationPreferencesChange({ effectIntensity: event.target.value as PresentationPreferences["effectIntensity"] })}><option value="quiet">Quiet tap</option><option value="standard">Standard hit</option><option value="high">HIYAH! maximum</option></select><small>Controls the volume of shared interface motion.</small></label>
        <label className="settings-control"><span>Display typeface</span><select value={presentationPreferences.displayFace} onChange={(event) => onPresentationPreferencesChange({ displayFace: event.target.value as PresentationPreferences["displayFace"] })}><option value="classic">Paper-Fu · Lilita One</option><option value="condensed">Condensed · Barlow</option></select><small>Compare the two heading styles across the public website.</small></label>
      </div>
    </section>

    <section className="settings-profile paper-stack" aria-labelledby="profile-title"><div><span className="eyebrow">05 / Personal record</span><h2 id="profile-title">Your Paper-Fu profile</h2><p>Your choices stay in this browser. No account. No backend. No committee minutes.</p></div><div className="settings-profile-stats"><div><strong>{AVATAR_OPTIONS.length}</strong><span>faces on file</span></div><div><strong>{ACCENT_OPTIONS.length}</strong><span>accent filings</span></div><div><strong>LOCAL</strong><span>browser-only profile</span></div></div><div className="settings-profile-actions"><button type="button" className="button ghost" onClick={resetPreferences}>Restore style defaults</button></div></section>
  </main>;
}

