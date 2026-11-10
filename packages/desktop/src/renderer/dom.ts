/** Look up an element the page must contain, throwing if it is absent. */
export function getRequiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Required element not found: ${selector}`);
  }
  return element;
}

/**
 * Wrap a text control in the app's one field layout: a label over the control.
 * `control` must already have its id, which the label points at.
 */
export function createField(control: HTMLInputElement, label: string, optional = false): HTMLDivElement {
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

  control.classList.add("input");
  const field = document.createElement("div");
  field.className = "field";
  field.append(caption, control);
  return field;
}
