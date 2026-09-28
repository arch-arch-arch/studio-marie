import { h } from './h.js';

export function vueProfil({ profil }, actions) {
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const zone = h('textarea', { id: 'profil-json', rows: 12, placeholder: 'Colle ici le JSON du profil de marque.' });
  const fichier = h('input', {
    type: 'file', accept: '.json,application/json',
    onchange: async e => { const f = e.target.files?.[0]; if (f) zone.value = await f.text(); },
  });
  const importer = async () => {
    erreurs.replaceChildren();
    const r = await actions.importerProfil(zone.value);
    if (!r.ok) erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
  };

  return h('div', { class: 'profil' },
    profil ? resume(profil) : h('p', { class: 'aide' }, 'Aucun profil pour l’instant. Importe le profil de marque pour commencer.'),
    h('section', { class: 'import' },
      h('h2', {}, profil ? 'Importer une nouvelle version' : 'Importer le profil'),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Fichier JSON'), fichier),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Ou colle le JSON'), zone),
      h('button', { type: 'button', class: 'bouton-principal', onclick: importer }, 'Importer cette version'),
      erreurs));
}

function resume(profil) {
  const r = profil.regles_studio;
  const date = profil.importe_le ? new Date(profil.importe_le).toLocaleString('fr-FR', { timeZone: r.fuseau }) : '—';
  const jours = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return h('section', { class: 'resume' },
    h('h2', {}, `Profil, version ${profil.version}`),
    h('p', { class: 'aide' }, `Importé le ${date}. Fuseau : ${r.fuseau}.`),
    h('dl', { class: 'regles' },
      h('dt', {}, 'Piliers'), h('dd', {}, r.piliers.map(p => h('span', { class: 'puce-pilier', style: { '--pilier': p.couleur } }, p.nom))),
      h('dt', {}, 'Cadence'), h('dd', {}, `${r.cadence.reel} Reels, ${r.cadence.carrousel} carrousels, ${r.cadence.story_par_jour} story par jour`),
      h('dt', {}, 'Créneaux'), h('dd', {}, r.creneaux.map(c => `${c.jours.map(j => jours[j]).join(' ')} ${c.debut}–${c.fin}`).join(' · ')),
      h('dt', {}, "Appels à l'action"), h('dd', {}, `au plus ${Math.round(r.cta_ratio_max * 100)} % du feed`),
      h('dt', {}, 'Stories vers la porte'), h('dd', {}, `${r.stories_porte.min} à ${r.stories_porte.max} par semaine`)));
}
