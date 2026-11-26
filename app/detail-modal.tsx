// The shared paper modal: focus trap, Escape, scroll lock and focus restoration.
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function DetailModal({ eyebrow, title, children, onClose, accent = "red" }: { eyebrow: string; title: string; children: ReactNode; onClose: () => void; accent?: "red" | "green" | "gold" }) {
  const modalRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); previouslyFocused?.focus({ preventScroll: true }); };
  }, []);
  return createPortal(<div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><article ref={modalRef} className={`detail-modal paper-stack accent-${accent}`} role="dialog" aria-modal="true" aria-labelledby="detail-modal-title"><i className="modal-burst" aria-hidden="true" /><button autoFocus className="modal-close" onClick={onClose} aria-label="Close details">×</button><span className="eyebrow">{eyebrow}</span><h2 id="detail-modal-title">{title}</h2>{children}</article></div>, document.body);
}
