function mkdiv(html, className, id, callbacks) {
    const div = document.createElement('div');
    if (html) div.innerHTML = html;
    if (className) div.className = className;
    if (id) div.id = id;
    if (callbacks) {
        callbacks.forEach(cb => {
            div.addEventListener(cb.event, cb.callback);
        });
    }
    return div;
}

function getCssVar(name) {
    return getComputedStyle(document.documentElement)
        .getPropertyValue(name).trim();
}

function getCssPx(name) {
    return parseInt(getCssVar(name), 10);
}
function genUid(length = 6) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  //const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => 
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join('');
}
const vmeUID = (() => {
  let counter = 0;
  return () => {
    const rand = Math.random().toString(36).slice(2, 8);
    return `vme-${rand}-${++counter}`;
  };
})();
