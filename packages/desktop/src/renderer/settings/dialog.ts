import { getRequiredElement } from "../dom.js";

export interface Dialog {
  /**
   * Show the dialog. Pass the control that asked for it when that is not the
   * registered trigger, so closing returns focus there rather than to a control
   * on a screen the user has left.
   */
  open(returnFocusTo?: HTMLElement): void;
  /** Hide the dialog, returning focus to whatever opened it. */
  close(): void;
}

export interface DialogOptions {
  /** Accessible name for the generated close button. */
  readonly closeLabel: string;
  readonly onOpen?: () => void;
  /** Runs however the dialog closes: its button, Escape, the backdrop, or `close`. */
  readonly onClose?: () => void;
}

const dialogs: Array<{ readonly overlay: HTMLElement; readonly close: () => void }> = [];

const focusableSelector =
  "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])";

/** Keeps Tab inside the open dialog, which aria-modal alone does not do. */
function keepFocusInside(event: KeyboardEvent, overlay: HTMLElement): void {
  const focusable = Array.from(overlay.querySelectorAll<HTMLElement>(focusableSelector));
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

document.addEventListener("keydown", (event): void => {
  const open = dialogs.find(({ overlay }) => !overlay.hidden);
  if (open === undefined) {
    return;
  }
  if (event.key === "Escape") {
    open.close();
  } else if (event.key === "Tab") {
    keepFocusInside(event, open.overlay);
  }
});

const svgNamespace = "http://www.w3.org/2000/svg";

function createCloseButton(label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "gear-button welcome-close";
  button.setAttribute("aria-label", label);
  button.title = label;

  const icon = document.createElementNS(svgNamespace, "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "18");
  icon.setAttribute("height", "18");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");

  const cross = document.createElementNS(svgNamespace, "path");
  cross.setAttribute("d", "M6 6l12 12M18 6 6 18");
  cross.setAttribute("fill", "none");
  cross.setAttribute("stroke", "currentColor");
  cross.setAttribute("stroke-linecap", "round");
  cross.setAttribute("stroke-width", "1.6");

  icon.append(cross);
  button.append(icon);
  return button;
}

/**
 * Wire a modal: its trigger, generated close button, backdrop click, Escape,
 * and focus trap. The markup holds only the dialog's own content.
 */
export function createDialog(overlayId: string, trigger: HTMLButtonElement, options: DialogOptions): Dialog {
  const overlay = getRequiredElement<HTMLElement>(overlayId);
  let returnFocusTo: HTMLElement = trigger;
  const close = (): void => {
    overlay.hidden = true;
    options.onClose?.();
    returnFocusTo.focus();
  };
  const open = (opener: HTMLElement = trigger): void => {
    returnFocusTo = opener;
    overlay.hidden = false;
    options.onOpen?.();
  };

  const closeButton = createCloseButton(options.closeLabel);
  closeButton.addEventListener("click", close);
  /* A "Done" button in the markup closes its dialog without wiring of its own. */
  for (const done of overlay.querySelectorAll<HTMLButtonElement>("[data-dialog-close]")) {
    done.addEventListener("click", close);
  }
  overlay.querySelector(".welcome-card")?.prepend(closeButton);

  /* Wrapped: a click listener would otherwise pass its event as the opener. */
  trigger.addEventListener("click", (): void => open());
  overlay.addEventListener("click", (event): void => {
    if (event.target === overlay) {
      close();
    }
  });
  dialogs.push({ overlay, close });

  return { open, close };
}
