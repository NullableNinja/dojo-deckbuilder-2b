// The Test Arena's fighter: "Dummy", a sack of flour on a stick wearing a helmet, a wooden shield and a wooden
// sword. Drawn as inline SVG in the Paper-Fu cut-paper style (flat shapes, ink outline, offset shadow) so it takes
// both themes, a team colour, and the status visuals (ice, flame, poison) without any image files.
// Presentation only: nothing here decides a rule.
import type { CSSProperties } from "react";

/** The flour sack's outline, shared so effects (scorch marks) can be clipped to it. */
export const SACK_PATH = "M110 70c-22 0-42 18-48 50-6 32-2 66 14 92 8 12 22 18 34 18s26-6 34-18c16-26 20-60 14-92-6-32-26-50-48-50z";

export type DummyStatus = { id: string; stacks: number; turns: number | null };

/** One Dummy. `team` colours the plume and waist rag; `flip` faces it left (art is mirrored, the label is not). */
export function DummyFigure({ team = "a", flip = false, label = "FLOUR" }: { team?: "a" | "b"; flip?: boolean; label?: string }) {
  return <svg className="dummy-svg" viewBox="0 0 220 320" role="img" aria-label="Dummy: a sack of flour on a stick with a helmet, a wooden shield and a wooden sword" data-team={team}>
    <ellipse cx="110" cy="306" rx="62" ry="9" className="dummy-ground" />
    <g transform={flip ? "translate(220 0) scale(-1 1)" : undefined} className="dummy-art">
      {/* The stick and its feet. */}
      <g className="dummy-stick">
        <rect x="103" y="160" width="14" height="140" rx="3" />
        <rect x="70" y="292" width="80" height="12" rx="3" />
        <rect x="88" y="286" width="44" height="8" rx="2" className="dummy-wood-dark" />
      </g>
      {/* The cross-bar the arms hang from. */}
      <rect x="38" y="150" width="144" height="10" rx="3" className="dummy-wood-dark" />
      {/* Shield arm (left of the figure). */}
      <g className="dummy-shield-arm">
        <rect x="30" y="146" width="12" height="46" rx="5" className="dummy-cloth" transform="rotate(8 36 168)" />
        <g className="dummy-shield">
          <circle cx="42" cy="196" r="38" className="dummy-shield-face" />
          <circle cx="42" cy="196" r="38" className="dummy-shield-rim" />
          <path d="M42 160v72M6 196h72" className="dummy-plank-line" />
          <circle cx="42" cy="196" r="9" className="dummy-boss" />
          <circle cx="18" cy="170" r="2.5" className="dummy-rivet" /><circle cx="66" cy="170" r="2.5" className="dummy-rivet" /><circle cx="18" cy="222" r="2.5" className="dummy-rivet" /><circle cx="66" cy="222" r="2.5" className="dummy-rivet" />
        </g>
      </g>
      {/* The flour sack. */}
      <g className="dummy-sack">
        <path d={SACK_PATH} className="dummy-sack-body" />
        <path d="M70 150c14 6 26 8 40 8s26-2 40-8" className="dummy-stitch" />
        <rect x="132" y="170" width="24" height="24" rx="2" className="dummy-patch" /><path d="M132 170l24 24M156 170l-24 24" className="dummy-stitch" />
        <rect x="64" y="198" width="22" height="18" rx="2" className="dummy-patch" />
        <path d="M70 198h16M70 202h16M70 206h16" className="dummy-stitch" />
        {/* Face: two button eyes and a stitched, unconvinced mouth. */}
        <circle cx="94" cy="118" r="6.5" className="dummy-eye" /><circle cx="126" cy="118" r="6.5" className="dummy-eye" />
        <circle cx="92" cy="116" r="1.8" className="dummy-eye-shine" /><circle cx="124" cy="116" r="1.8" className="dummy-eye-shine" />
        <path d="M92 140c8 5 28 5 36-1" className="dummy-mouth" /><path d="M96 142v-5M104 145v-5M112 145v-5M120 142v-5" className="dummy-stitch" />
        {/* Waist rag in the team colour. */}
        <path d="M66 176c20 8 68 8 88 0l2 14c-22 9-70 9-92 0z" className="dummy-rag" />
      </g>
      {/* The helmet. */}
      <g className="dummy-helmet">
        <path d="M68 92c0-30 18-48 42-48s42 18 42 48z" className="dummy-helmet-dome" />
        <path d="M62 92h96v12H62z" className="dummy-helmet-rim" />
        <path d="M92 52c8-4 16-4 24 0" className="dummy-dent" />
        <circle cx="76" cy="98" r="2.5" className="dummy-rivet" /><circle cx="110" cy="98" r="2.5" className="dummy-rivet" /><circle cx="144" cy="98" r="2.5" className="dummy-rivet" />
        <path d="M110 44c4-14 22-20 34-14-8 2-14 8-14 18z" className="dummy-plume" />
      </g>
      {/* Sword arm (right of the figure): the sword pivots at the hand. */}
      <g className="dummy-sword-arm">
        <rect x="178" y="146" width="12" height="40" rx="5" className="dummy-cloth" transform="rotate(-10 184 166)" />
        <g className="dummy-sword" style={{ transformOrigin: "186px 182px" } as CSSProperties}>
          <rect x="181" y="96" width="10" height="92" rx="2" className="dummy-blade" />
          <path d="M181 96l5-12 5 12z" className="dummy-blade" />
          <path d="M183 112h6M183 128h6M183 144h6" className="dummy-nick" />
          <rect x="174" y="186" width="24" height="8" rx="2" className="dummy-guard" />
          <rect x="182" y="194" width="8" height="22" rx="3" className="dummy-grip" />
          <path d="M182 198h8M182 204h8M182 210h8" className="dummy-tape" />
        </g>
      </g>
    </g>
    {/* The label sits outside the mirrored group so it never reads backwards. */}
    <text x="110" y="167" textAnchor="middle" className="dummy-label">{label}</text>
  </svg>;
}
