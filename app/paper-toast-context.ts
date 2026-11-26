// Paper toasts are owned by the app shell; pages raise them through this context.
import { createContext, useContext } from "react";

export type ToastKind = "note" | "success" | "warning" | "stamp" | "critical";
export type ToastInput = { kind?: ToastKind; eyebrow?: string; title: string; message?: string; duration?: number; variant?: number };

export const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined);
export const usePaperToast = () => useContext(ToastContext);

export const prefersReducedMotion = () => typeof window !== "undefined"
  && (document.documentElement.dataset.motion === "reduced" || window.matchMedia("(prefers-reduced-motion: reduce)").matches);
export const paperScrollBehavior = (): ScrollBehavior => prefersReducedMotion() ? "auto" : "smooth";
