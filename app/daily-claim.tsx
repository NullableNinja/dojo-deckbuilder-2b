// Card of the Day, claimable: if today's card is one you do not own yet, you can unwrap it into your
// collection (no ticket, no wait), with the pack-opening ceremony. Owned cards, locked fighters and Open
// Dojo get a plain status line instead. Presentation over the career store; the engine decides what is claimable.
import { useState } from "react";
import { economy, careerStore } from "./career";
import { useCareer } from "./use-career";
import { PackCeremony } from "./pack-ceremony";
import { navigate } from "./routing";
import type { CardEntry } from "./search";
import type { UnlockSource } from "./collection";

const DAILY_SOURCE = (card: CardEntry): UnlockSource => ({ id: "card-of-the-day", kind: "booster", name: "Card of the Day", tagline: "Today's special issue, filed straight into your collection.", catalogIds: [card.catalogId] });

export function DailyClaim({ card, imageUrlFor }: { card: CardEntry; imageUrlFor: (card: CardEntry) => string }) {
  const career = useCareer();
  const [ceremony, setCeremony] = useState(false);
  const [claimedNow, setClaimedNow] = useState(false);
  const state = career.state;
  if (career.status !== "career" || !state) return null;
  const owned = economy.ownedCards(state).has(card.catalogId);
  const collectible = !economy.unlockEverything && economy.isCollectible(card.catalogId);

  const claim = () => {
    const result = careerStore.claimCard(card.catalogId);
    if (!result.error) { setClaimedNow(true); setCeremony(true); }
  };

  let status: React.ReactNode;
  if (state.openDojo) status = <>Open Dojo is on, so every card is on loan. Switch to My Collection to keep this one.</>;
  else if (!collectible) {
    const source = economy.unlockSource(card.catalogId);
    status = source.kind === "level" ? <>A fighter or Boss card: it opens at Clearance Level {source.level}.</> : <>{owned ? "Already in your collection." : "This one is standard issue: every table already plays with it."}</>;
  }
  else if (owned && !claimedNow) status = <>Already in your collection.</>;

  return <div className="cotd-claim">
    {collectible && !state.openDojo && (!owned || claimedNow)
      ? (claimedNow
        ? <p className="cotd-claim-status is-claimed" role="status"><b>Filed.</b> Today's card is in your collection. <button type="button" className="cotd-claim-link" onClick={() => navigate({ page: "cards", cardId: card.catalogId })}>Open it in the Card Library →</button></p>
        : <button type="button" className="button primary cotd-claim-button" onClick={claim}><span aria-hidden="true">✦</span> Unwrap today's card</button>)
      : status && <p className="cotd-claim-status" role="status">{status}</p>}
    {ceremony && <PackCeremony source={DAILY_SOURCE(card)} cards={[card]} packNumber={1} remaining={0} mode="career" daily imageUrlFor={imageUrlFor} onKeepGoing={() => undefined} onDone={() => setCeremony(false)} />}
  </div>;
}
