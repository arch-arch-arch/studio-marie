import { validerReponse } from '../claude/evaluation.js';
import { couper } from './dossier.js';

export const MESSAGE_SANS_BLOC = 'Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l’assistant, puis recolle-la.';
export const MESSAGE_COUPE = `${MESSAGE_SANS_BLOC} Si la réponse a été coupée, demande à l’assistant de redonner seulement le bloc.`;

const RAISON_EXEMPLE = 'exemple recopié, pas une analyse';
const ROLES = ['engagement', 'cta', 'deadpan'];
const AVIS_MAX = 4000;
const LISTE_MAX = 12;
const ELEMENT_MAX = 500;

const CITATIONS = [
  /\uE200[^\uE201]{0,500}\uE201/g,
  /[\uE200-\uE2FF]/g,
  /:codex-file-citation\{[^}]{0,500}\}/g,
  /:contentReference\[oaicite:\d+\]\{[^}]{0,200}\}/g,
  /【[^】]{0,500}】/g,
  /\[oaicite:[^\]]{0,100}\]/g,
  /\b(?:file)?cite(?:turn\d+[a-z]+\d+)+/g,
];
const estObjet = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const estTexte = v => typeof v === 'string' && v.trim().length > 0;
// Texte non vide fait uniquement de points, de points de suspension et d'espaces : un exemple recopié.
const sansSubstance = v => typeof v === 'string' && v.trim().length > 0 && /^[.…\s]*$/.test(v);

const retirerCitations = t => CITATIONS.reduce((acc, re) => acc.replace(re, ''), t);

// [U+1F525] (code écrit par le dossier) redevient le caractère ; les codes invalides restent tels quels.
const reconvertirCodes = t => t.replace(/\[U\+([0-9A-Fa-f]{2,6})\]/g, (m, hex) => {
  const code = parseInt(hex, 16);
  return code > 0xFF && code <= 0x10FFFF && !(code >= 0xD800 && code <= 0xDFFF) ? String.fromCodePoint(code) : m;
});

function nettoyer(valeur) {
  if (typeof valeur === 'string') return reconvertirCodes(retirerCitations(valeur)).replace(/[ \t]{2,}/g, ' ').trim();
  if (Array.isArray(valeur)) return valeur.map(nettoyer);
  if (estObjet(valeur)) return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, nettoyer(v)]));
  return valeur;
}

function normaliserRef(v) {
  const t = typeof v === 'number' && Number.isInteger(v) && v >= 0 ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!t) return '';
  const m = /^f?\s*0*(\d+)$/i.exec(t);
  return m ? `F${m[1].padStart(2, '0')}` : t;
}

function candidats(texte) {
  const blocs = [...texte.matchAll(/```[a-zA-Z]*\s*\n([\s\S]*?)```/g)].map(m => m[1]).reverse();
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut >= 0 && fin > debut) blocs.push(texte.slice(debut, fin + 1));
  return blocs;
}

function analyserJson(c) {
  try { return { ok: true, valeur: JSON.parse(c) }; } catch { /* second essai */ }
  try { return { ok: true, valeur: JSON.parse(retirerCitations(c)) }; } catch { return { ok: false }; }
}

export function lireRetour(texte) {
  try {
    const brut = typeof texte === 'string' ? texte : '';
    let dossierLu = false;
    for (const c of candidats(brut)) {
      const lu = analyserJson(c);
      if (!lu.ok) continue;
      const objet = lu.valeur;
      if (estObjet(objet) && 'dossier' in objet) dossierLu = true;
      if (estObjet(objet) && estTexte(objet.dossier) && Array.isArray(objet.fiches)) {
        const propre = nettoyer(objet);
        return { ok: true, dossier: propre.dossier.trim(), fiches: propre.fiches, periode: estObjet(propre.periode) ? propre.periode : null };
      }
    }
    const coupe = !dossierLu && /"dossier"/.test(brut);
    return { ok: false, raison: coupe ? MESSAGE_COUPE : MESSAGE_SANS_BLOC };
  } catch {
    return { ok: false, raison: MESSAGE_SANS_BLOC };
  }
}

function validerPeriode(p, refs) {
  if (!estObjet(p) || !estTexte(p.avis) || sansSubstance(p.avis)) return null;
  const textes = xs => (Array.isArray(xs) ? xs.filter(x => estTexte(x) && !sansSubstance(x)).map(s => couper(s.trim(), ELEMENT_MAX)).slice(0, LISTE_MAX) : []);
  const ordre = Array.isArray(p.ordre_conseille) ? [...new Set(p.ordre_conseille.map(normaliserRef).filter(r => refs.has(r)))] : [];
  return { avis: couper(p.avis.trim(), AVIS_MAX), points_forts: textes(p.points_forts), risques: textes(p.risques), ordre_conseille: ordre };
}

function textesDeLaFiche(f) {
  const t = [];
  if (estObjet(f.phrases)) t.push(f.phrases.accroche, f.phrases.voix, f.phrases.mecanique);
  if (Array.isArray(f.captions)) t.push(...f.captions.map(c => c?.texte));
  if (Array.isArray(f.accroches)) t.push(...f.accroches);
  if (Array.isArray(f.recommandations)) t.push(...f.recommandations.map(x => (typeof x === 'string' ? x : x?.texte)));
  return t;
}

const CAPTIONS_FACTICES = [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'x' }];

// Sépare les captions utilisables (rôle autorisé, rôles distincts, texte non vide) des autres, avec la cause de chaque écart.
function trierCaptions(captions) {
  const gardees = [];
  const inconnus = [];
  let manquant = false;
  let doublon = false;
  let vide = false;
  for (const c of captions) {
    const role = estObjet(c) ? c.role : undefined;
    if (!estTexte(role)) manquant = true;
    else if (!ROLES.includes(role)) inconnus.push(role);
    else if (!estTexte(c.texte)) vide = true;
    else if (gardees.some(g => g.role === role)) doublon = true;
    else gardees.push({ role, texte: c.texte.trim() });
  }
  const causes = [];
  if (inconnus.length) causes.push(`rôle inconnu ${inconnus.join(', ')}`);
  if (manquant) causes.push('rôle manquant');
  if (doublon) causes.push('deux fois le même rôle');
  if (vide) causes.push('texte vide');
  return { gardees, remarque: causes.length ? `variante de caption écartée : ${causes.join(' ; ')}` : null };
}

export function validerRetour(retour, analyse) {
  const illisible = { valides: [], ecartees: [{ ref: '?', raison: 'retour illisible' }], periode: null };
  try {
    if (!estObjet(retour) || !Array.isArray(retour.fiches)) return illisible;
    const fichesAnalyse = (estObjet(analyse) && Array.isArray(analyse.fiches) ? analyse.fiches : []).filter(estObjet);
    const parRef = new Map(fichesAnalyse.map(f => [normaliserRef(f.ref), f]));
    const apparues = new Set();
    const gardees = new Set();
    const valides = [];
    const ecartees = [];
    for (const brute of retour.fiches) {
      const lue = estObjet(brute) ? normaliserRef(brute.id) : '';
      if (!lue) { ecartees.push({ ref: '?', raison: 'entrée sans référence' }); continue; }
      const connue = parRef.get(lue);
      if (!connue) { ecartees.push({ ref: lue, raison: 'référence inconnue' }); continue; }
      const ref = lue;
      apparues.add(ref);
      let ecart = null;
      if (textesDeLaFiche(brute).some(sansSubstance)) {
        ecart = { ref, raison: RAISON_EXEMPLE };
      } else {
        // Une caption au rôle inconnu écarte la variante, pas l'analyse : le reste est validé avec des captions factices.
        const tri = Array.isArray(brute.captions) && brute.captions.length === 2 ? trierCaptions(brute.captions) : null;
        const partielle = tri && tri.gardees.length < 2;
        const v = validerReponse(partielle ? { ...brute, captions: CAPTIONS_FACTICES } : brute);
        if (!v.ok) {
          ecart = { ref, raison: `réponse incomplète (${v.erreurs.join(' ; ')})` };
        } else if (!gardees.has(ref)) {
          gardees.add(ref);
          const jugement = partielle ? { ...v.jugement, captions: tri.gardees } : v.jugement;
          valides.push({ ref, id: connue.id, empreinte: connue.empreinte, jugement, ...(partielle && tri.remarque ? { remarque: tri.remarque } : {}) });
          continue;
        }
      }
      ecartees.push(gardees.has(ref) ? { ref, raison: 'référence en double' } : ecart);
    }
    for (const f of fichesAnalyse) if (!apparues.has(normaliserRef(f.ref))) ecartees.push({ ref: f.ref, raison: 'absente de la réponse' });
    return { valides, ecartees, periode: validerPeriode(retour.periode, new Set(parRef.keys())) };
  } catch {
    return illisible;
  }
}
