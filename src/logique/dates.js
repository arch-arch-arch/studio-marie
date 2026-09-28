const deux = n => String(n).padStart(2, '0');
const JOURS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const formateurs = new Map();

function formateur(fuseau) {
  if (!formateurs.has(fuseau)) {
    formateurs.set(fuseau, new Intl.DateTimeFormat('en-US', {
      timeZone: fuseau, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short',
    }));
  }
  return formateurs.get(fuseau);
}

export function partiesLocales(iso, fuseau) {
  const p = Object.fromEntries(formateur(fuseau).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { annee: +p.year, mois: +p.month, jour: +p.day, heure: +p.hour % 24, minute: +p.minute, jourSemaine: JOURS[p.weekday] };
}

export function versUtc({ annee, mois, jour, heure = 0, minute = 0 }, fuseau) {
  const voulu = Date.UTC(annee, mois - 1, jour, heure, minute);
  let t = voulu;
  for (let i = 0; i < 3; i++) {
    const p = partiesLocales(new Date(t).toISOString(), fuseau);
    const obtenu = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute);
    if (obtenu === voulu) break;
    t += voulu - obtenu;
  }
  return new Date(t).toISOString();
}

const dateUtc = (a, m, j) => new Date(Date.UTC(a, m - 1, j));

function decaler(iso, jours, fuseau, garderHeure) {
  const p = partiesLocales(iso, fuseau);
  const d = dateUtc(p.annee, p.mois, p.jour + jours);
  return versUtc({
    annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: d.getUTCDate(),
    heure: garderHeure ? p.heure : 0, minute: garderHeure ? p.minute : 0,
  }, fuseau);
}

export const ajouterJours = (iso, n, fuseau) => decaler(iso, n, fuseau, true);
export const debutJour = (iso, fuseau) => decaler(iso, 0, fuseau, false);
export const debutSemaine = (iso, fuseau) => decaler(iso, 1 - partiesLocales(iso, fuseau).jourSemaine, fuseau, false);
export const joursDeLaSemaine = (debutIso, fuseau) => Array.from({ length: 7 }, (_, i) => ajouterJours(debutIso, i, fuseau));

export function debutMois(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return versUtc({ annee: p.annee, mois: p.mois, jour: 1 }, fuseau);
}

export function ajouterMois(iso, n, fuseau) {
  const p = partiesLocales(iso, fuseau);
  const d = dateUtc(p.annee, p.mois + n, 1);
  return versUtc({ annee: d.getUTCFullYear(), mois: d.getUTCMonth() + 1, jour: 1 }, fuseau);
}

export function semainesDuMois(iso, fuseau) {
  const debut = debutMois(iso, fuseau);
  const fin = ajouterMois(debut, 1, fuseau);
  const semaines = [];
  for (let s = debutSemaine(debut, fuseau); s < fin; s = ajouterJours(s, 7, fuseau)) semaines.push(s);
  return semaines;
}

export function cleJour(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

export function heureLocale(iso, fuseau) {
  const p = partiesLocales(iso, fuseau);
  return `${deux(p.heure)}:${deux(p.minute)}`;
}

export function depuisSaisieLocale(date, heure, fuseau) {
  const [annee, mois, jour] = date.split('-').map(Number);
  const [h, m] = heure.split(':').map(Number);
  return versUtc({ annee, mois, jour, heure: h, minute: m }, fuseau);
}

export function libelleJour(iso, fuseau) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone: fuseau, weekday: 'short', day: 'numeric' }).format(new Date(iso));
}
