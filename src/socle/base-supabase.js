const TABLE = 'documents';
const PAGE = 1000;
const DELAI_RELECTURE = 40;
const DELAI_GRACE_CANAL = 10000;
const OPERATEURS = { '>=': 'gte', '<': 'lt', '==': 'eq' };
const CODES_REVOQUES = new Set(['PGRST301', 'PGRST302', 'PGRST303', '42501']);

// Dans postgrest-js, `status` est sur la réponse ; `error` ne porte que { message, details, hint, code }.
function erreurBase(error, status) {
  const revoque = status === 401 || status === 403 || CODES_REVOQUES.has(error?.code);
  return Object.assign(new Error(error?.message || 'Erreur de la base.'), { code: revoque ? 'revoked' : (error?.code || 'unavailable') });
}

const signature = v => JSON.stringify(v.docs ? v.docs.map(d => [d.id, d.data()]) : [v.exists, v.data()]);

export function creerBaseSupabase(client, { delaiGraceMs = DELAI_GRACE_CANAL } = {}) {
  const abonnes = new Map(); // collection -> Set de { relire, erreur }
  let canal = null;
  let minuteurGrace = null;

  function chaqueAbonne(action) {
    for (const ensemble of [...abonnes.values()]) for (const a of [...ensemble]) action(a);
  }

  function ouvrirCanal() {
    if (canal) return;
    canal = client.channel('documents').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, charge => {
      const collection = charge.new?.collection ?? charge.old?.collection;
      for (const a of [...(abonnes.get(collection) ?? [])]) a.relire();
    }).subscribe(statut => {
      if (statut === 'SUBSCRIBED') {
        if (minuteurGrace) { clearTimeout(minuteurGrace); minuteurGrace = null; }
        chaqueAbonne(a => a.relire());
      } else if ((statut === 'CHANNEL_ERROR' || statut === 'TIMED_OUT') && !minuteurGrace) {
        // realtime-js émet CHANNEL_ERROR à chaque fermeture du socket (veille, réseau, onglet masqué) puis se reconnecte seul :
        // l'erreur n'est signalée que si SUBSCRIBED ne revient pas dans le délai de grâce.
        minuteurGrace = setTimeout(() => {
          minuteurGrace = null;
          chaqueAbonne(a => a.erreur?.(Object.assign(new Error('Canal temps réel indisponible.'), { code: 'unavailable' })));
        }, delaiGraceMs);
      }
    });
  }

  function ecouter(collection, lire, suivant, erreur) {
    let actif = true;
    let minuteur = null;
    let enVol = false;
    let aRelire = false;
    let derniere = null;
    let derniereErreur = null;
    // Même dédoublonnage pour les erreurs de lecture et de canal ; l'état sera relivré ensuite.
    const signaler = e => {
      derniere = null;
      const cle = `${e?.code}|${e?.message}`;
      if (actif && cle !== derniereErreur) { derniereErreur = cle; erreur?.(e); }
    };
    // Une seule lecture à la fois : un événement pendant une lecture en programme une autre à la fin.
    async function livrer() {
      if (enVol) { aRelire = true; return; }
      enVol = true;
      try {
        do {
          aRelire = false;
          let v = null;
          let echec = null;
          try { v = await lire(); } catch (e) { echec = e; }
          if (!actif) break;
          if (echec) { signaler(echec); continue; }
          derniereErreur = null;
          const s = signature(v);
          if (s === derniere) continue;
          derniere = s;
          try { suivant(v); } catch (e) { console.error(e); } // une exception du consommateur n'est pas une erreur de base
        } while (aRelire && actif);
      } finally {
        enVol = false;
      }
    }
    const relire = () => {
      if (minuteur || !actif) return;
      minuteur = setTimeout(() => { minuteur = null; if (actif) livrer(); }, DELAI_RELECTURE);
    };
    const abonne = { relire, erreur: signaler };
    if (!abonnes.has(collection)) abonnes.set(collection, new Set());
    abonnes.get(collection).add(abonne);
    ouvrirCanal();
    livrer();
    return () => {
      actif = false;
      if (minuteur) clearTimeout(minuteur);
      abonnes.get(collection)?.delete(abonne);
    };
  }

  const instantane = (id, ligne) => ({ id, exists: !!ligne, data: () => (ligne ? ligne.data : undefined) });

  function doc(chemin) {
    const coupe = chemin.indexOf('/');
    const collection = chemin.slice(0, coupe);
    const id = chemin.slice(coupe + 1);
    const lire = async () => {
      const { data, error, status } = await client.from(TABLE).select('id,data').eq('collection', collection).eq('id', id).maybeSingle();
      if (error) throw erreurBase(error, status);
      return instantane(id, data);
    };
    return {
      id,
      path: chemin,
      get: lire,
      async set(corps) {
        const { error, status } = await client.from(TABLE).upsert({ collection, id, data: corps, maj_le: new Date().toISOString() });
        if (error) throw erreurBase(error, status);
      },
      async delete() {
        const { error, status } = await client.from(TABLE).delete().eq('collection', collection).eq('id', id);
        if (error) throw erreurBase(error, status);
      },
      onSnapshot: (suivant, erreur) => ecouter(collection, lire, suivant, erreur),
    };
  }

  function requete(collection, filtres) {
    const lire = async () => {
      const lignes = [];
      for (let debut = 0; ; debut += PAGE) {
        let q = client.from(TABLE).select('id,data').eq('collection', collection);
        for (const [champ, op, v] of filtres) q = q[OPERATEURS[op]](`data->>${champ}`, v);
        const { data, error, status } = await q.order('id').range(debut, debut + PAGE - 1);
        if (error) throw erreurBase(error, status);
        lignes.push(...data);
        if (data.length < PAGE) break;
      }
      const docs = lignes.map(l => instantane(l.id, l));
      return { docs, size: docs.length, empty: docs.length === 0 };
    };
    return {
      where(champ, op, v) {
        if (!OPERATEURS[op]) throw new Error(`Opérateur non pris en charge : ${op}`);
        return requete(collection, [...filtres, [champ, op, v]]);
      },
      get: lire,
      onSnapshot: (suivant, erreur) => ecouter(collection, lire, suivant, erreur),
      doc: id => doc(`${collection}/${id}`),
    };
  }

  return { doc, collection: nom => requete(nom, []) };
}
