import { validerReponse } from '../claude/evaluation.js';

export const MESSAGE_SANS_BLOC = 'Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l’assistant, puis recolle-la.';
export const MESSAGE_COUPE = `${MESSAGE_SANS_BLOC} Si la réponse a été coupée, demande à l’assistant de redonner seulement le bloc.`;

const CITATIONS = [/:codex-file-citation\{[^}]*\}/g, /【[^】]*】/g, /\[oaicite:[^\]]*\]/g, /\bciteturn[\w-]*/g];
const estObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = v => typeof v === 'string' && v.trim().length > 0;

function nettoyer(valeur) {
  if (typeof valeur === 'string') {
    let t = valeur;
    for (const re of CITATIONS) t = t.replace(re, '');
    return t.replace(/[ \t]{2,}/g, ' ').trim();
  }
  if (Array.isArray(valeur)) return valeur.map(nettoyer);
  if (estObjet(valeur)) return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, nettoyer(v)]));
  return valeur;
}

function candidats(texte) {
  const blocs = [...texte.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map(m => m[1]).reverse();
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut >= 0 && fin > debut) blocs.push(texte.slice(debut, fin + 1));
  return blocs;
}

export function lireRetour(texte) {
  try {
    const brut = typeof texte === 'string' ? texte : '';
    let lisible = false;
    for (const c of candidats(brut)) {
      let objet;
      try { objet = JSON.parse(c); } catch { continue; }
      lisible = true;
      if (estObjet(objet) && estTexte(objet.dossier) && Array.isArray(objet.fiches)) {
        const propre = nettoyer(objet);
        return { ok: true, dossier: propre.dossier.trim(), fiches: propre.fiches, periode: estObjet(propre.periode) ? propre.periode : null };
      }
    }
    const coupe = !lisible && /"dossier"\s*:/.test(brut);
    return { ok: false, raison: coupe ? MESSAGE_COUPE : MESSAGE_SANS_BLOC };
  } catch {
    return { ok: false, raison: MESSAGE_SANS_BLOC };
  }
}

function validerPeriode(p, refs) {
  if (!estObjet(p) || !estTexte(p.avis)) return null;
  const textes = xs => (Array.isArray(xs) ? xs.filter(estTexte).map(s => s.trim()) : []);
  return { avis: p.avis.trim(), points_forts: textes(p.points_forts), risques: textes(p.risques), ordre_conseille: textes(p.ordre_conseille).filter(r => refs.has(r)) };
}

export function validerRetour(retour, analyse) {
  const vide = { valides: [], ecartees: [], periode: null };
  try {
    if (!estObjet(retour) || !Array.isArray(retour.fiches)) return vide;
    const fichesAnalyse = estObjet(analyse) && Array.isArray(analyse.fiches) ? analyse.fiches.filter(estObjet) : [];
    const parRef = new Map(fichesAnalyse.map(f => [f.ref, f]));
    const vues = new Set();
    const valides = [];
    const ecartees = [];
    for (const brute of retour.fiches) {
      const ref = estObjet(brute) && estTexte(brute.id) ? brute.id.trim() : '?';
      const connue = parRef.get(ref);
      if (!connue) { ecartees.push({ ref, raison: 'référence inconnue' }); continue; }
      if (vues.has(ref)) { ecartees.push({ ref, raison: 'référence en double' }); continue; }
      vues.add(ref);
      const v = validerReponse(brute);
      if (!v.ok) { ecartees.push({ ref, raison: `réponse incomplète (${v.erreurs[0]})` }); continue; }
      valides.push({ ref, id: connue.id, empreinte: connue.empreinte, jugement: v.jugement });
    }
    for (const f of fichesAnalyse) if (!vues.has(f.ref)) ecartees.push({ ref: f.ref, raison: 'absente de la réponse' });
    return { valides, ecartees, periode: validerPeriode(retour.periode, new Set(parRef.keys())) };
  } catch {
    return vide;
  }
}
