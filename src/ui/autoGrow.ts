// A Svelte action making a textarea as tall as its text, so several lines show at once rather
// than scrolling inside a three-row box. Its `rows` stays the least height. Pass the bound
// value as the parameter, so a value set from code (not typed) resizes it too.

export function autoGrow(el: HTMLTextAreaElement, _value?: string) {
  const fit = () => {
    el.style.height = 'auto';
    const border = el.offsetHeight - el.clientHeight;
    el.style.height = `${el.scrollHeight + border}px`;
  };
  // Rewrapping on a width change (pane resize, phone rotation) changes the lines needed.
  let width = el.clientWidth;
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    if (el.clientWidth !== width) {
      width = el.clientWidth;
      fit();
    }
  });
  ro?.observe(el);
  el.addEventListener('input', fit);
  fit();
  return {
    update: () => fit(),
    destroy: () => {
      el.removeEventListener('input', fit);
      ro?.disconnect();
    },
  };
}
