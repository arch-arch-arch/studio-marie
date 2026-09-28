import { cleJour, heureLocale } from '../logique/dates.js';
import { analyserHashtags } from '../logique/fiche.js';

export const TAILLE_PROFIL_MAX = 30000;
export const TAILLE_PROMPT_MAX = 60000;
const octets = t => new TextEncoder().encode(t).length;
const AUTRES_SECTIONS_PROFIL = ['identite_de_marque', 'ton_et_voix', 'vocabulaire', 'regles_do', 'regles_dont', 'formats_de_contenu', 'audience', 'principe_directeur_final'];
const ORDRE_RETRAIT = ['audience', 'principe_directeur_final', 'vocabulaire', 'formats_de_contenu', 'regles_do', 'regles_dont', 'identite_de_marque', 'ton_et_voix'];
const ROLES = ['engagement', 'cta', 'deadpan'];
const CRITERES = ['accroche', 'voix', 'mecanique'];

export function extraireProfil(profil) {
  const extrait = {};
  if (profil.regles_studio !== undefined) extrait.regles_studio = profil.regles_studio;
  for (const cle of AUTRES_SECTIONS_PROFIL) if (profil[cle] !== undefined) extrait[cle] = profil[cle];
  let texte = JSON.stringify(extrait);
  for (const cle of ORDRE_RETRAIT) {
    if (octets(texte) <= TAILLE_PROFIL_MAX) break;
    delete extrait[cle];
    texte = JSON.stringify(extrait);
  }
  return texte;
}

function assemblerPrompt({ fiche, profil, verification, fichesSemaine, avecImage }) {
  const fz = profil.regles_studio.fuseau;
  const contenu = {
    format: fiche.format, pilier: fiche.pilier, format_valide: fiche.format_valide || null,
    role_caption: fiche.role_caption, appel_a_l_action: !!fiche.cta, ragebait: !!fiche.ragebait, mene_a_la_porte: !!fiche.porte,
    date_heure_locale: `${cleJour(fiche.date_heure, fz)} ${heureLocale(fiche.date_heure, fz)}`,
    accroche: (fiche.accroche ?? '').slice(0, 300), caption: (fiche.caption ?? '').slice(0, 2200),
    hashtags: (fiche.hashtags ?? []).slice(0, 30), geotag: (fiche.geotag ?? '').slice(0, 200),
    visuel: avecImage ? 'joint à ce message' : fiche.visuel ? 'présent mais non joint' : 'aucun',
  };
  const semaine = fichesSemaine
    .filter(f => f.id !== fiche.id)
    .slice(0, 30)
    .map(f => ({ format: f.format, pilier: f.pilier, role_caption: f.role_caption, cta: !!f.cta, accroche: (f.accroche ?? '').slice(0, 120) }));
  return [
    'Tu es l’éditrice exigeante d’un compte Instagram. Évalue UN contenu au regard du profil de marque ci-dessous.',
    'Tu notes le contenu sans le modifier ; tes propositions de captions et d’accroches sont des variantes à part. Tes suggestions suivent la voix du profil. N’invente aucune donnée.',
    '',
    '## Profil de marque (JSON)',
    extraireProfil(profil),
    '',
    '## Contenu à évaluer (JSON)',
    JSON.stringify(contenu),
    '',
    '## Règles calculées (elles font autorité : tu ne peux pas lever un blocage)',
    JSON.stringify(verification),
    '',
    '## Autres contenus de la semaine',
    JSON.stringify(semaine),
    '',
    '## Ce que tu notes, de 0 à 10',
    '- accroche : force de l’accroche (lisible en moins d’une seconde, paradoxe ou question), potentiel d’envoi et de sauvegarde, visage face caméra si le visuel est joint ;',
    '- voix : test de voix et vocabulaire du profil, esthétique si le visuel est joint, cohérence avec le pilier ;',
    '- mecanique : première ligne qui provoque avant « …plus », une seule micro-action, structure attendue pour ce format.',
    'Conformité : "rouge" si la surface n’est pas SFW, si un groupe ou une identité est visé, si l’âge adulte est ambigu ou si un boost payant est suggéré ; "orange" si un risque mérite attention ; sinon "vert". Causes courtes et précises.',
    '',
    '## Format de réponse',
    'Réponds uniquement avec un objet JSON de cette forme :',
    '{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot","autre"],"recommandations":["…","…","…"]}',
    'Contraintes : une phrase par critère ; exactement 2 captions de rôles différents parmi engagement, cta et deadpan ; 2 ou 3 accroches ; hashtags sans # ; exactement 3 recommandations concrètes ; tout en français.',
  ].join('\n');
}

export function construirePrompt({ fiche, profil, verification, fichesSemaine = [], avecImage = false }) {
  const texte = assemblerPrompt({ fiche, profil, verification, fichesSemaine, avecImage });
  if (octets(texte) <= TAILLE_PROMPT_MAX) return texte;
  return assemblerPrompt({ fiche, profil, verification, fichesSemaine: [], avecImage });
}

const texte = v => typeof v === 'string' && v.trim().length > 0;

export function validerReponse(r) {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return { ok: false, erreurs: ['La réponse n’est pas un objet JSON.'] };
  const erreurs = [];
  for (const c of CRITERES) {
    if (!texte(r.phrases?.[c])) erreurs.push(`phrases.${c} manquante.`);
  }
  for (const c of CRITERES) {
    const n = r.notes?.[c];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10) erreurs.push(`notes.${c} doit être un nombre de 0 à 10.`);
  }
  if (!['vert', 'orange', 'rouge'].includes(r.conformite?.etat)) erreurs.push('conformite.etat doit valoir vert, orange ou rouge.');
  if (!Array.isArray(r.conformite?.causes) || !r.conformite.causes.every(texte)) erreurs.push('conformite.causes doit être une liste de textes.');
  const captionsOk = Array.isArray(r.captions) && r.captions.length === 2
    && r.captions.every(c => ROLES.includes(c?.role) && texte(c?.texte)) && r.captions[0].role !== r.captions[1].role;
  if (!captionsOk) erreurs.push('captions : exactement 2 captions de rôles différents.');
  if (!Array.isArray(r.accroches) || r.accroches.length < 2 || r.accroches.length > 3 || !r.accroches.every(texte)) erreurs.push('accroches : 2 ou 3 textes.');
  if (!Array.isArray(r.hashtags) || !r.hashtags.every(texte)) erreurs.push('hashtags : liste de textes.');
  if (!Array.isArray(r.recommandations) || r.recommandations.length !== 3 || !r.recommandations.every(texte)) erreurs.push('recommandations : exactement 3 textes.');
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    jugement: {
      notes: { accroche: r.notes.accroche, voix: r.notes.voix, mecanique: r.notes.mecanique },
      phrases: { accroche: r.phrases.accroche.trim(), voix: r.phrases.voix.trim(), mecanique: r.phrases.mecanique.trim() },
      conformite: { etat: r.conformite.etat, causes: r.conformite.causes.map(s => s.trim()) },
      captions: r.captions.map(c => ({ role: c.role, texte: c.texte.trim() })),
      accroches: r.accroches.map(s => s.trim()),
      hashtags: analyserHashtags(r.hashtags.map(t => t.replace(/\s+/g, '')).join(' ')),
      recommandations: r.recommandations.map(s => s.trim()),
    },
  };
}

export const CODES_INDISPONIBLES = new Set(['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed']);

export function messageErreurSample(e) {
  if (CODES_INDISPONIBLES.has(e?.code)) return 'L’évaluation par Claude n’est pas disponible pour ce compte ou cette vue.';
  switch (e?.code) {
    case 'cancelled': return '';
    case 'rate_limited': return 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.';
    case 'session_expired': return 'Ta session a expiré : reconnecte-toi à claude.ai, puis réessaie.';
    case 'invalid_json': return 'La réponse de Claude était illisible : réessaie. Rien n’a été modifié.';
    case 'refused': return 'Claude a refusé d’évaluer ce contenu : reformule-le, puis réessaie.';
    case 'prompt_too_large': return 'Le contenu envoyé à Claude est trop volumineux : raccourcis la caption, les hashtags ou le géotag.';
    case 'empty_completion': return 'Claude n’a rien répondu : simplifie le contenu, puis réessaie. Rien n’a été modifié.';
    case 'image_rejected': return 'Le visuel n’a pas pu être envoyé à Claude : réessaie, ou remplace-le.';
    case 'images_unavailable': return 'Le visuel ne peut pas être envoyé à Claude dans cette vue : retire-le ou évalue depuis un autre appareil.';
    case 'invalid_request':
    case 'transform_error':
    case 'queue_overflow':
      return 'Erreur interne du studio : l’évaluation n’a pas pu être envoyée. Rien n’a été modifié.';
    default: return 'L’évaluation a échoué (service indisponible) : réessaie. Rien n’a été modifié.';
  }
}
