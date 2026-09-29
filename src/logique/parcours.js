import { aReevaluer } from './fiche.js';
import { RELEVES, etatReleves } from './indicateurs.js';
import { libelleJour, heureLocale } from './dates.js';

export const ACTIONS_SANS_SUITE = new Set(['attendre', 'termine']);
const RETARD_PUBLICATION_MS = 24 * 3600000;
const LIBELLES_RELEVE = { '48h': '48 h', '7j': '7 jours' };

const action = (cle, libelle, detail = '', retard = false) => ({ cle, libelle, detail, retard });
const quand = (iso, fuseau) => `${libelleJour(iso, fuseau)} à ${heureLocale(iso, fuseau)}`;

export function prochaineAction(fiche, releves, maintenant, fuseau) {
  const passee = fiche.date_heure <= maintenant;
  if (fiche.statut === 'idee' || fiche.statut === 'brouillon') {
    const manque = [!fiche.visuel && 'un visuel', fiche.format !== 'story' && !fiche.caption?.trim() && 'une caption'].filter(Boolean);
    if (manque.length) return action('terminer', `Terminer : ajoute ${manque.join(' et ')}`, '', passee);
    if (!fiche.score) return action('evaluer', 'Évaluer', '', passee);
    if (aReevaluer(fiche)) return action('reevaluer', 'Réévaluer', '', passee);
    if (fiche.score.conformite?.etat === 'rouge') return action('corriger', 'Corriger la conformité', (fiche.score.conformite.causes ?? []).join(' ; '), passee);
    if (fiche.score.conformite?.etat !== 'vert' && fiche.score.conformite?.etat !== 'orange') return action('reevaluer', 'Réévaluer', '', passee);
    return action('valider', 'Valider la fiche', '', passee);
  }
  if (fiche.statut === 'valide') return action('programmer', 'Confirmer la programmation', '', passee);
  if (fiche.statut === 'programme') {
    if (passee) return action('publier', 'Confirmer la publication', '', Date.parse(maintenant) - Date.parse(fiche.date_heure) > RETARD_PUBLICATION_MS);
    if (!fiche.programme_pour || fiche.programme_pour !== fiche.date_heure) {
      const detail = fiche.programme_pour ? 'La date a changé depuis la confirmation.' : 'Confirme la date programmée dans Meta Business Suite.';
      return action('reconfirmer', 'Reconfirmer la programmation', detail, passee);
    }
    return action('attendre', `Programmé pour le ${quand(fiche.date_heure, fuseau)}`);
  }
  const e = etatReleves(fiche, releves, maintenant);
  const dus = RELEVES.filter(r => e[r].etat === 'a_saisir');
  if (dus.length) return action('stats', `Saisir les stats à ${dus.map(r => LIBELLES_RELEVE[r]).join(' et à ')}`, '', true);
  const suivant = RELEVES.find(r => e[r].etat === 'pas_encore');
  if (suivant) return action('attendre', `Prochain relevé le ${quand(e[suivant].du_le, fuseau)}`);
  return action('termine', 'Terminé');
}
