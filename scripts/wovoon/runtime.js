// Only included in the standalone Wovoon export, never in the normal web/APK build.
(() => {
  const entries = window.__wovoonAssets;
  delete window.__wovoonAssets;
  const urls = new Map();
  const root = new URL('.', location.href);
  function keyFor(value) {
    if (typeof value !== 'string' || /^(data:|blob:|#)/i.test(value)) return null;
    let key = value.replace(/^\.\//, '').replace(/^\//, '').split(/[?#]/)[0];
    if (entries[key] || urls.has(key)) return key;
    try {
      const url = new URL(value, root);
      if (url.origin !== root.origin || url.protocol !== root.protocol) return null;
      key = decodeURIComponent(url.pathname.slice(root.pathname.length));
      if (entries[key] || urls.has(key)) return key;
    } catch { /* Non-resource values pass through. */ }
    return null;
  }
  function resolve(value) {
    const key = keyFor(value);
    if (!key) return value;
    if (!urls.has(key)) {
      const [type, encoded] = entries[key];
      const raw = atob(encoded), bytes = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      urls.set(key, URL.createObjectURL(new Blob([bytes], {type})));
      delete entries[key];
    }
    return urls.get(key);
  }
  const css = text => text.replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/g,
    (_, quote, path) => `url("${resolve(path)}")`);
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const original = input instanceof Request ? input.url : String(input);
    const url = resolve(original);
    return originalFetch(url === original ? input : url,
      input instanceof Request && url !== original ? {signal: input.signal, ...init} : init);
  };
  for (const proto of [HTMLImageElement.prototype, HTMLMediaElement.prototype]) {
    const property = Object.getOwnPropertyDescriptor(proto, 'src');
    Object.defineProperty(proto, 'src', {...property, set(value) {property.set.call(this, resolve(String(value)));}});
  }
  const NativeAudio = window.Audio;
  window.Audio = function (src) { return new NativeAudio(src === undefined ? undefined : resolve(String(src))); };
  window.Audio.prototype = NativeAudio.prototype;
  const setAttribute = Element.prototype.setAttribute;
  const innerHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {...innerHTML, set(value) {
    const html = String(value).replace(/(\bsrc\s*=\s*)(["'])([^"']+)\2/gi,
      (_, prefix, quote, url) => prefix + quote + resolve(url) + quote);
    innerHTML.set.call(this, html);
  }});
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'src' && (this instanceof HTMLImageElement || this instanceof HTMLMediaElement)) value = resolve(String(value));
    if (name === 'style') value = css(String(value));
    return setAttribute.call(this, name, value);
  };
  const setProperty = CSSStyleDeclaration.prototype.setProperty;
  for (const name of ['background', 'backgroundImage', 'cssText']) {
    const property = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, name);
    if (property?.set) Object.defineProperty(CSSStyleDeclaration.prototype, name,
      {...property, set(value) { property.set.call(this, css(String(value))); }});
  }
  CSSStyleDeclaration.prototype.setProperty = function (name, value, priority) {
    return setProperty.call(this, name, typeof value === 'string' ? css(value) : value, priority);
  };
  // CSS property assignment and HTML fragments can bypass the setters above.
  function patch(element) {
    if (!(element instanceof Element)) return;
    if (element.matches('img,audio,video')) {
      const value = element.getAttribute('src');
      if (value && resolve(value) !== value) setAttribute.call(element, 'src', resolve(value));
    }
    const style = element.getAttribute('style');
    if (style && css(style) !== style) setAttribute.call(element, 'style', css(style));
  }
  new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') patch(record.target);
      for (const node of record.addedNodes) if (node instanceof Element) {
        patch(node); node.querySelectorAll('img,audio,video,[style]').forEach(patch);
      }
    }
  }).observe(document.documentElement, {subtree: true, childList: true, attributes: true, attributeFilter: ['src','style']});
  window.__wovoonResolve = resolve;
  window.__wovoonStyle = text => {
    const style = document.createElement('style');style.textContent = css(text);document.head.append(style);
  };
})();
