type NumberStyle = 'quantity' | 'damage';

/** Alpha masks inherit currentColor; punctuation and localized words remain text. */
export function pixelText(text: string, style: NumberStyle = 'quantity'): HTMLSpanElement {
  const wrapper = document.createElement('span');
  wrapper.className = `pixel-number pixel-number-${style}`;
  wrapper.setAttribute('aria-label', text);
  for (const char of text) {
    const glyph = document.createElement('span');
    glyph.setAttribute('aria-hidden', 'true');
    if (/^[0-9]$/.test(char)) {
      glyph.className = 'pixel-digit';
      const url = `url("${import.meta.env.BASE_URL}assets/ui/sunlit/numerals/${style}/${char}.webp")`;
      glyph.style.maskImage = url;
      glyph.style.webkitMaskImage = url;
    } else glyph.textContent = char;
    wrapper.appendChild(glyph);
  }
  return wrapper;
}

export function setPixelText(element: HTMLElement, text: string, style: NumberStyle = 'quantity'): void {
  if (element.dataset.pixelValue === `${style}:${text}`) return;
  element.dataset.pixelValue = `${style}:${text}`;
  element.replaceChildren(pixelText(text, style));
}
