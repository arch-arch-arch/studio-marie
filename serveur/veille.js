import { timingSafeEqual } from 'node:crypto';
import { construireVeille, plageVeille, doitTourner } from '../src/logique/veille.js';
import { construireConsignesVeille } from '../src/claude/veille-consignes.js';
import { nouvelId } from '../src/logique/fiche.js';
import { verifierSession } from './session.js';
import { cleConfiguree, codeErreur, extraireJson, texteDe, MODELE } from './claude.js';
import { journaliser } from './http.js';

const TABLE = 'documents';
const MARQUEUR = 'veille_en_cours';
const MARQUEUR_MS = 6 * 60_000;
const PAUSES_MAX = 4;
// La fonction Vercel s'arrête à 300 s : on n'appelle plus Claude au-delà de ce budget.
const BUDGET_MS = 270_000;
const echec = (code, extra = {}) => ({ ok: false, code, ...extra });
const erreur = code => Object.assign(new Error(code), { code });
const STATUTS = { rate_limited: 429, profil_absent: 409, conflict: 409, invalid_json: 422 };
const TRONQUEE = ['La réponse a été tronquée avant la fin : renvoie l’objet JSON complet, plus concis.'];

// Au plus 1000 lignes par collection : voulu.
async function lire(supabase, collection, filtres = []) {
  let q = supabase.from(TABLE).select('id,data').eq('collection', collection);
  for (const [champ, op, v] of filtres) q = q[op](`data->>${champ}`, v);
  const { data, error } = await q.order('id').range(0, 999);
  if (error) throw erreur('unavailable');
  return data.map(l => ({ id: l.id, ...l.data }));
}

async function lireDocument(supabase, collection, id) {
  const { data, error } = await supabase.from(TABLE).select('id,data').eq('collection', collection).eq('id', id).maybeSingle();
  if (error) throw erreur('unavailable');
  return data ? { id: data.id, ...data.data } : null;
}

// Marqueur « veille en cours » : un échec de lecture, d'écriture ou de retrait ne fait jamais échouer la veille.
async function marqueurRecent(supabase, maintenant) {
  try {
    const m = await lireDocument(supabase, 'config', MARQUEUR);
    const age = Date.parse(maintenant) - Date.parse(m?.depuis);
    return Number.isFinite(age) && age < MARQUEUR_MS;
  } catch {
    return false;
  }
}
async function poserMarqueur(supabase, maintenant) {
  try { await supabase.from(TABLE).upsert({ collection: 'config', id: MARQUEUR, data: { depuis: maintenant } }); } catch { /* sans effet sur la veille */ }
}
// Le marqueur n'est retiré que s'il est encore celui de cette exécution (même `depuis`) : il peut avoir été reposé par une autre veille.
async function retirerMarqueur(supabase, maintenant) {
  try { await supabase.from(TABLE).delete().eq('collection', 'config').eq('id', MARQUEUR).eq('data->>depuis', maintenant); } catch { /* sans effet sur la veille */ }
}

// Renvoie la réponse finale et l'historique des messages qui y mène : chaque segment en pause y figure.
async function demander(claude, systeme, messages, budgetRestant) {
  let historique = messages;
  for (let i = 0; i <= PAUSES_MAX; i += 1) {
    // Le délai du SDK ne borne pas le corps d'un flux : le signal abandonne l'appel au budget restant.
    const signal = AbortSignal.timeout(budgetRestant());
    const reponse = await claude.messages.stream({
      model: MODELE, max_tokens: 16000, system: systeme,
      tools: [{ type: 'web_search_20260209', name: 'web_search' }],
      messages: historique,
    }, { signal }).finalMessage();
    if (reponse.stop_reason === 'refusal') throw erreur('refused');
    if (reponse.stop_reason !== 'pause_turn') return { reponse, historique };
    historique = [...historique, { role: 'assistant', content: reponse.content }];
  }
  throw erreur('unavailable');
}

export async function lancerVeille({ supabase, claude, maintenant, forcer = false, idAleatoire = nouvelId, horloge = () => Date.now(), budgetMs = BUDGET_MS }) {
  const depart = horloge();
  const budgetRestant = () => {
    const restant = budgetMs - (horloge() - depart);
    if (restant <= 0) throw erreur('unavailable');
    return restant;
  };
  let marqueurPose = false;
  try {
    const profil = await lireDocument(supabase, 'profil', 'courant');
    if (!profil?.regles_studio) return echec('profil_absent');
    const regles = profil.regles_studio;
    if (!doitTourner(regles, maintenant, { forcer })) return { ok: true, lance: false, resume: 'Veille déjà faite ou hors horaire.' };
    if (await marqueurRecent(supabase, maintenant)) return { ok: true, lance: false, resume: 'Une veille est déjà en cours.' };
    await poserMarqueur(supabase, maintenant);
    marqueurPose = true;
    const plage = plageVeille(regles, maintenant);
    const bulletinDepart = await lireDocument(supabase, 'bulletins', plage.semaine);
    const fiches = await lire(supabase, 'fiches', [['date_heure', 'gte', plage.lecture_debut], ['date_heure', 'lt', plage.lecture_fin]]);
    const stats = await lire(supabase, 'stats_contenu', [['date_publication', 'gte', plage.lecture_debut], ['date_publication', 'lt', plage.debut]]);
    const relevesCompte = await lire(supabase, 'releves_compte', [['debut', 'gte', plage.lecture_debut], ['debut', 'lt', plage.debut]]);
    const { systeme, message } = construireConsignesVeille({ profil, fiches, stats, relevesCompte, plage, maintenant });

    let messages = [{ role: 'user', content: message }];
    let resultat = null;
    for (let essai = 0; essai < 2; essai += 1) {
      const { reponse, historique } = await demander(claude, systeme, messages, budgetRestant);
      if (reponse.stop_reason === 'max_tokens' || reponse.stop_reason === 'model_context_window_exceeded') {
        resultat = { ok: false, erreurs: TRONQUEE };
      } else {
        let entree;
        // La réponse finale seule d'abord : la narration d'un segment en pause peut contenir une accolade.
        // Sinon, le texte de tous les segments de l'essai (ajoutés depuis son début), puis la réponse finale.
        try { entree = extraireJson(texteDe(reponse)); } catch { entree = null; }
        if (!entree) {
          const texteEssai = [...historique.slice(messages.length), reponse].map(m => texteDe(m)).join('');
          try { entree = extraireJson(texteEssai); } catch { entree = null; }
        }
        resultat = entree
          ? construireVeille({ profil, fiches, entree, maintenant, idAleatoire, stats, relevesCompte })
          : { ok: false, erreurs: ['La réponse n’était pas un objet JSON.'] };
      }
      if (resultat.ok) break;
      messages = [...historique, { role: 'assistant', content: reponse.content },
        { role: 'user', content: `Ta réponse n’est pas valide. Corrige ces points et renvoie uniquement l’objet JSON complet :\n${resultat.erreurs.join('\n')}` }];
    }
    if (!resultat.ok) return echec('invalid_json', { erreurs: resultat.erreurs });

    // Une suppression n'est émise que si le maj_le lu est connu : sans lui, on ne saurait pas qu'elle porte sur la version lue.
    const majLe = new Map(fiches.map(f => [f.id, f.maj_le]));
    const ecrituresFiches = resultat.ecritures
      .filter(e => !(e.op === 'delete' && e.collection === 'fiches' && majLe.get(e.doc_id) == null))
      .map(e => (e.op === 'delete' && e.collection === 'fiches' ? { ...e, si_maj_le: majLe.get(e.doc_id) } : e));
    // Garde-fou : le bulletin de la semaine doit être resté tel que lu au départ, sinon une autre veille est passée entre-temps.
    const ecritures = [{ op: 'verifier', collection: 'bulletins', doc_id: plage.semaine, champ: 'genere_le', valeur: bulletinDepart?.genere_le ?? null }, ...ecrituresFiches];
    const { error } = await supabase.rpc('appliquer_veille', { ecritures });
    if (error) return echec(String(error.message ?? '').includes('veille_conflit') ? 'conflict' : 'unavailable');
    const remplacees = ecrituresFiches.filter(e => e.op === 'delete').length;
    return { ok: true, lance: true, resume: `Bulletin ${resultat.cle} : ${resultat.fichesCreees.length} idée(s), ${remplacees} remplacée(s), statut ${resultat.bulletin.statut}.` };
  } catch (e) {
    return echec(codeErreur(e));
  } finally {
    if (marqueurPose) await retirerMarqueur(supabase, maintenant);
  }
}

// Comparaison en temps constant : les tampons doivent avoir la même longueur, sinon refus.
function secretValide(autorisation, secret) {
  if (typeof secret !== 'string' || !secret || typeof autorisation !== 'string') return false;
  const attendu = Buffer.from(`Bearer ${secret}`);
  const recu = Buffer.from(autorisation);
  return recu.length === attendu.length && timingSafeEqual(recu, attendu);
}

export async function traiterVeille({ methode, autorisation, env, supabaseSession, supabaseService, claude, maintenant, idAleatoire, horloge, budgetMs }) {
  if (methode !== 'GET' && methode !== 'POST') return { statut: 405, corps: { code: 'invalid_request' } };
  if (methode === 'GET') {
    if (!secretValide(autorisation, env.CRON_SECRET)) return { statut: 401, corps: { code: 'session_expired' } };
  } else if (!(await verifierSession(supabaseSession, autorisation)).ok) {
    return { statut: 401, corps: { code: 'session_expired' } };
  }
  if (!cleConfiguree(env) || !supabaseService) return { statut: 403, corps: { code: 'not_granted' } };
  const r = await lancerVeille({ supabase: supabaseService, claude, maintenant, forcer: methode === 'POST', idAleatoire, horloge, budgetMs });
  if (r.ok) return { statut: 200, corps: r };
  const statut = STATUTS[r.code] ?? 502;
  // Une ligne : la route, le statut et le code. Jamais le prompt, la réponse de Claude, le profil ni un secret.
  journaliser('veille', { status: statut, name: r.code });
  return { statut, corps: r };
}
