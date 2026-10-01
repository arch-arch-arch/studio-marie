import { extraireProfilDetaille } from './evaluation.js';

const SYSTEME = [
  'Tu prépares la veille hebdomadaire d’un compte Instagram : tendances de la semaine et 3 à 5 idées de contenus, dans la voix du profil de marque fourni.',
  '',
  'Règles :',
  '- Pas de scraping d’Instagram. Utilise la recherche web pour : les annonces d’Instagram aux créateurs (algorithme, règlement, formats), les rapports publics de tendances (sons, formats de Reels, memes) et les tendances de la niche du profil, sur les 14 derniers jours.',
  '- Passe chaque tendance au filtre de la marque (voix, esthétique, conformité SFW, mots à éviter) : elle est adaptée, avec la façon de l’adapter, ou écartée, avec la raison. Garde 3 à 5 tendances.',
  '- Un son tendance porte son_a_verifier à true.',
  '- Si la recherche ne donne rien d’exploitable, mets sources_indisponibles à true, laisse tendances vide et propose quand même des idées à partir du profil et des performances passées.',
  '- Un changement de règle Instagram devient une alerte. Si le profil devrait évoluer, décris-le dans proposition_profil : tu ne modifies jamais le profil.',
  '- Rédige 3 à 5 idées : format, pilier (une clé de regles_studio.piliers), role_caption (engagement, cta ou deadpan), cta, accroche, caption et hashtags. Respecte la cadence, la part d’appels à l’action et la rotation des rôles, en tenant compte des contenus déjà prévus. Ne repropose pas une idée proche d’un contenu déjà prévu.',
  '- Appuie-toi sur les performances passées : reprends les mécaniques des meilleurs contenus, évite celles des pires.',
  '- Évalue chaque idée comme une éditrice exigeante, dans "jugement" : une phrase par critère, exactement 2 captions de rôles différents, 2 ou 3 accroches, hashtags sans #, exactement 3 recommandations, chacune avec un pourquoi court.',
  '- Tout en français.',
  '',
  'Réponds uniquement avec un objet JSON de cette forme, sans texte autour :',
  '{"sources_indisponibles":false,"tendances":[{"titre":"…","source":"URL ou nom","date":"AAAA-MM-JJ","pourquoi":"…","adaptation":"…","duree_vie":"…","son_a_verifier":false}],"ecartees":[{"titre":"…","raison":"…"}],"alertes":[{"texte":"…","proposition_profil":null}],"idees":[{"format":"reel","pilier":"…","role_caption":"engagement","cta":false,"format_valide":"","accroche":"…","caption":"…","hashtags":["…"],"tendance":null,"jugement":{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot"],"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]}}]}',
].join('\n');

export function construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant }) {
  const prevus = fiches.slice(0, 60).map(f => ({ format: f.format, pilier: f.pilier, role_caption: f.role_caption ?? null, cta: !!f.cta, statut: f.statut, date_heure: f.date_heure, accroche: (f.accroche ?? '').slice(0, 160) }));
  const releves = stats.slice(0, 40).map(s => ({ format: s.format, accroche: (s.accroche ?? '').slice(0, 160), releve: s.releve, vues: s.vues, nouveaux_abonnes: s.nouveaux_abonnes, partages_envois: s.partages_envois }));
  const message = [
    `Nous sommes le ${maintenant}. Semaine visée : ${plage.semaine}, du ${plage.debut} au ${plage.fin} (UTC).`,
    '',
    '## Profil de marque (JSON)',
    extraireProfilDetaille(profil).texte,
    '',
    '## Contenus déjà prévus ou récents (JSON)',
    JSON.stringify(prevus),
    '',
    '## Relevés de statistiques des deux dernières semaines (JSON)',
    JSON.stringify(releves),
    '',
    '## Relevés du compte (JSON)',
    JSON.stringify(relevesCompte.slice(-4)),
  ].join('\n');
  return { systeme: SYSTEME, message };
}
