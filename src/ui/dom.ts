// Petites utilitats per crear elements de la interfície.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  parent?.append(e);
  return e;
}

export function button(
  parent: HTMLElement,
  text: string,
  onClick: () => void,
  title = '',
): HTMLButtonElement {
  const b = el('button', 'btn', parent, text);
  b.type = 'button';
  if (title) b.title = title;
  b.addEventListener('click', onClick);
  return b;
}
