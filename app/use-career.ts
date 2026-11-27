// React binding for the career store: re-renders when the career changes (here or in another tab).
import { useSyncExternalStore } from "react";
import { careerStore, type CareerSnapshot } from "./career";

export function useCareer(): CareerSnapshot {
  return useSyncExternalStore(careerStore.subscribe, careerStore.get, careerStore.get);
}
