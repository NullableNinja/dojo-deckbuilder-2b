// The Card of the Day is shared by Home and the Card Library, so both show the same card on the same day.
export const dayNumber = () => Math.floor(Date.now() / 86_400_000);

/** Characters and Bosses are fighters, not filings; they are never the Card of the Day. */
export const isFeaturable = (card: { cardType: string }) => card.cardType !== "Character" && card.cardType !== "Boss";

export const pickBySeed = <T,>(items: T[], seed: number): T => items[((seed * 2_654_435) % items.length + items.length) % items.length];
