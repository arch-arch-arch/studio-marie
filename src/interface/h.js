export function h(tag, props = {}, ...enfants) {
  const el = document.createElement(tag);
  for (const [cle, valeur] of Object.entries(props ?? {})) {
    if (valeur == null || valeur === false) continue;
    if (cle.startsWith('on') && typeof valeur === 'function') el.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else if (cle === 'class') el.className = valeur;
    else if (cle === 'style' && typeof valeur === 'object') {
      for (const [p, v] of Object.entries(valeur)) {
        if (p.startsWith('--')) el.style.setProperty(p, v); else el.style[p] = v;
      }
    } else if (cle in el && !cle.includes('-')) el[cle] = valeur;
    else el.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const enfant of enfants.flat(Infinity)) {
    if (enfant == null || enfant === false) continue;
    el.append(enfant instanceof Node ? enfant : String(enfant));
  }
  return el;
}
