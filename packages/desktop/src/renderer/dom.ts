import { friendlyMessage } from "../shared/text.js";

/** Look up an element the page must contain, throwing if it is absent. */
export function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

/**
 * Wrap a control in the app's one field layout: a label over the control.
 * `control` must already have its id, which the label points at.
 */
export function createField(
  control: HTMLInputElement | HTMLSelectElement,
  label: string,
  optional = false,
): HTMLDivElement {
  const caption = document.createElement("label");
  caption.className = "field-label";
  caption.htmlFor = control.id;
  caption.textContent = label;
  if (optional) {
    const note = document.createElement("span");
    note.className = "field-optional";
    note.textContent = "(optional)";
    caption.append(" ", note);
  }

  control.classList.add(control instanceof HTMLSelectElement ? "select" : "input");
  const field = document.createElement("div");
  field.className = "field";
  field.append(caption, control);
  return field;
}

/** Show a failure in a message element, in the sentence a partner should read. */
export function showError(surface: HTMLElement, error: unknown, fallback: string): void {
  surface.textContent = friendlyMessage(error, fallback);
  surface.dataset.tone = "error";
}

/**
 * Mark a button busy while its work runs: disabled, announced as busy, its
 * spinner shown and its label changed. The button holds a `.loading-spinner`
 * and then its label.
 */
export function setBusy(button: HTMLButtonElement, busy: boolean, label: string): void {
  button.disabled = busy;
  button.setAttribute("aria-busy", String(busy));
  button.querySelector<HTMLElement>(".loading-spinner")?.toggleAttribute("hidden", !busy);
  if (button.lastElementChild !== null) {
    button.lastElementChild.textContent = label;
  }
}
