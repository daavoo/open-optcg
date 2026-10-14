export function valueOf(id: string): string {
  const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `#${id}`,
  );
  if (!element) throw new Error(`MISSING_FIELD: ${id}`);
  return element.value;
}

export function valueOfOptional(id: string): string | null {
  return (
    document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
      ?.value ?? null
  );
}

export function downloadText(filename: string, value: string): void {
  downloadBytes(filename, value, "text/plain");
}

export function downloadBytes(
  filename: string,
  value: BlobPart,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

// A rerender replaces the search input with a fresh element, so refocusing it
// alone leaves the caret at position 0 and every keystroke lands at the front.
// Carry the caret across the swap until the editors render incrementally.
export function rerenderPreservingCaret(
  id: string,
  input: HTMLInputElement,
  rerender: () => void,
): void {
  const { selectionStart, selectionEnd, selectionDirection } = input;
  rerender();
  const next = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!next) return;
  next.focus();
  if (selectionStart !== null && selectionEnd !== null) {
    next.setSelectionRange(
      selectionStart,
      selectionEnd,
      selectionDirection ?? undefined,
    );
  }
}
