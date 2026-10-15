import { ReactNode, useEffect, useRef, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  zIndexClass?: string;
}

// Tap-friendly panel that slides up from the bottom on phones (centered on
// wider screens). Used instead of hover tooltips, which iOS Safari never shows.
// Rendered into <body> through a portal: inside the page tree, a parent's
// margins (space-y) or transform (motion) would shift the fixed overlay and
// leave part of the screen uncovered and tappable.
// Body scroll lock shared by all open sheets: lock on the first, unlock when
// the last one closes (saving/restoring per sheet breaks when sheets stack and
// close out of order).
let openSheets = 0;
let overflowBeforeLock = "";
function lockScroll() {
  if (openSheets === 0) {
    overflowBeforeLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  openSheets += 1;
}
function unlockScroll() {
  openSheets = Math.max(0, openSheets - 1);
  if (openSheets === 0) document.body.style.overflow = overflowBeforeLock;
}

// Taps right after a sheet opens are ignored: the second tap of a double tap on
// whatever opened it would otherwise land on the sheet as it slides up (e.g.
// confirming "Quit game" by accident).
const OPEN_TAP_GUARD_MS = 350;

export default function BottomSheet({ open, onClose, title, children, zIndexClass = "z-[60]" }: Props) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const openedAtRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    openedAtRef.current = performance.now();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open]);

  const guardEarlyTaps = (e: MouseEvent) => {
    if (performance.now() - openedAtRef.current < OPEN_TAP_GUARD_MS) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div
          className={`fixed inset-0 ${zIndexClass} flex items-end sm:items-center justify-center`}
          role="dialog"
          aria-modal="true"
          onClickCapture={guardEarlyTaps}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
            className="relative w-full max-w-lg max-h-[85vh] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl text-left"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2 border-b border-border">
              <div className="font-bold text-lg min-w-0">{title}</div>
              <button onClick={onClose} aria-label="Close" className="p-2 -mr-2 text-muted-foreground hover:text-foreground shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto overscroll-contain px-4 py-3">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
