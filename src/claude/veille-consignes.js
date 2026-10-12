import { extraireProfilDetaille } from './evaluation.js';
import { FORMATS } from '../logique/fiche.js';

const SYSTEME = [
  'Tu prépares la veille hebdomadaire d’un compte Instagram : tendances de la semaine et 3 à 5 idées de contenus, dans la voix du profil de marque fourni.',
  '',
  'Règles :',
  '- Pas de scraping d’Instagram. Utilise la recherche web pour : les annonces d’Instagram aux créateurs (algorithme, règlement, formats), les rapports publics de tendances (sons, formats de Reels, memes) et les tendances de la niche du profil, sur les 14 derniers jours.',
  '- Passe chaque tendance au filtre de la marque (voix, esthétique, conformité SFW, mots à éviter) : elle est adaptée, avec la façon de l’adapter, ou écartée, avec la raison. Garde 3 à 5 tendances.',
  '- Si tu as moins de 3 tendances exploitables, mets sources_indisponibles à true et garde celles que tu as (5 au maximum). Sans ce drapeau, 3 à 5 tendances sont exigées.',
  '- Un son tendance porte son_a_verifier à true.',
  '- Si la recherche ne donne rien d’exploitable, mets sources_indisponibles à true, laisse tendances vide et propose quand même des idées à partir du profil et des performances passées.',
  '- Un changement de règle Instagram devient une alerte. Si le profil devrait évoluer, décris-le dans proposition_profil : tu ne modifies jamais le profil.',
  '- Rédige 3 à 5 idées : format, pilier (une clé de regles_studio.piliers), role_caption (engagement, cta ou deadpan), cta, accroche, caption et hashtags. Respecte le contrôle de semaine du profil, en tenant compte des contenus déjà prévus : cadence des formats (reels, carrousels, stories par jour), part d’appels à l’action (cta_ratio_max), rotation des rôles de caption (roles_caption), ragebait (ragebait_max), stories vers la porte (stories_porte) et répartition entre les piliers. Ne repropose pas une idée proche d’un contenu déjà prévu.',
  '- Appuie-toi sur les performances passées : les relevés montrent ce qui a le mieux marché (abonnés par vue, puis partages et envois). Reprends les mécaniques des meilleurs contenus, évite celles des pires.',
  `- Valeurs permises : format : ${FORMATS.join(', ')} ; role_caption : engagement, cta ou deadpan ; conformite.etat : vert, orange ou rouge ; notes : des entiers de 0 à 10 (accroche, voix, mecanique) ; chaque role de captions : engagement, cta ou deadpan ; cta : true ou false ; pilier : une clé de regles_studio.piliers.`,
  '- tendance vaut le titre exact d’une tendance retenue, ou null.',
  '- Évalue chaque idée comme une éditrice exigeante, dans "jugement" : une phrase par critère, exactement 2 captions de rôles différents, 2 ou 3 accroches, hashtags sans #, exactement 3 recommandations, chacune avec un pourquoi court.',
  '- Tout en français.',
  '',
  'Réponds uniquement avec un objet JSON de cette forme, sans texte autour :',
  '{"sources_indisponibles":false,"tendances":[{"titre":"…","source":"URL ou nom","date":"AAAA-MM-JJ","pourquoi":"…","adaptation":"…","duree_vie":"…","son_a_verifier":false}],"ecartees":[{"titre":"…","raison":"…"}],"alertes":[{"texte":"…","proposition_profil":null}],"idees":[{"format":"reel","pilier":"…","role_caption":"engagement","cta":false,"format_valide":"","accroche":"…","caption":"…","hashtags":["…"],"tendance":null,"jugement":{"notes":{"accroche":7,"voix":8,"mecanique":6},"phrases":{"accroche":"…","voix":"…","mecanique":"…"},"conformite":{"etat":"vert","causes":[]},"captions":[{"role":"engagement","texte":"…"},{"role":"deadpan","texte":"…"}],"accroches":["…","…"],"hashtags":["mot"],"recommandations":[{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"},{"texte":"…","pourquoi":"…"}]}}]}',
].join('\n');

// Fiches de la semaine visée d'abord, puis les plus récentes : la coupe garde ce qui compte le plus pour l'équilibre de la semaine.
const parProximite = plage => (a, b) => {
  const dansA = a.date_heure >= plage.debut && a.date_heure < plage.fin;
  const dansB = b.date_heure >= plage.debut && b.date_heure < plage.fin;
  if (dansA !== dansB) return dansA ? -1 : 1;
  return (b.date_heure ?? '').localeCompare(a.date_heure ?? '');
};

export function construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant }) {
  const prevus = [...fiches].sort(parProximite(plage)).slice(0, 60).map(f => ({ format: f.format, pilier: f.pilier, role_caption: f.role_caption ?? null, cta: !!f.cta, statut: f.statut, date_heure: f.date_heure, accroche: (f.accroche ?? '').slice(0, 160) }));
  const releves = [...stats].sort((a, b) => (b.date_publication ?? '').localeCompare(a.date_publication ?? '')).slice(0, 40).map(s => ({ format: s.format, accroche: (s.accroche ?? '').slice(0, 160), releve: s.releve, vues: s.vues, nouveaux_abonnes: s.nouveaux_abonnes, partages_envois: s.partages_envois }));
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
