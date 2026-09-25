import { getRequiredElement } from "../dom.js";

export interface Dialog {
  /**
   * Shows the dialog. Pass the control that asked for it when that is not the
   * registered trigger, so closing returns focus there rather than to a control
   * on a screen the user is no longer looking at.
   */
  open(returnFocusTo?: HTMLElement): void;
}

export interface DialogOptions {
  /** Accessible name for the generated close button. */
  readonly closeLabel: string;
  readonly onOpen?: () => void;
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

/* One key handler serves every dialog, rather than one listener per dialog. */
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
 * Wires a modal: its trigger, generated close button, backdrop click, Escape,
 * and focus trap. The markup holds only the dialog's own content.
 */
export function createDialog(overlayId: string, trigger: HTMLButtonElement, options: DialogOptions): Dialog {
  const overlay = getRequiredElement<HTMLElement>(overlayId);
  let returnFocusTo: HTMLElement = trigger;
  const close = (): void => {
    overlay.hidden = true;
    returnFocusTo.focus();
  };
  const open = (opener: HTMLElement = trigger): void => {
    returnFocusTo = opener;
    overlay.hidden = false;
    options.onOpen?.();
  };

  const closeButton = createCloseButton(options.closeLabel);
  closeButton.addEventListener("click", close);
  overlay.querySelector(".welcome-card")?.prepend(closeButton);

  /* Wrapped: a click listener would otherwise pass its event as the opener. */
  trigger.addEventListener("click", (): void => open());
  overlay.addEventListener("click", (event): void => {
    if (event.target === overlay) {
      close();
    }
  });
  /* Closing is driven by Escape, the backdrop, and the close button, never by a caller. */
  dialogs.push({ overlay, close });

  return { open };
}
