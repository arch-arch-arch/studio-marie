# Mise en service : Vercel et Supabase

Ce guide t'explique, pas à pas, comment installer le studio sur Vercel (le site) et Supabase (la base de données, la connexion et le stockage des images). Tu n'as besoin d'aucune compétence technique : il suffit de suivre les étapes dans l'ordre. Les noms des boutons et des menus peuvent varier un peu selon la version de l'interface : cherche alors le nom le plus proche.

## 1. Ce qu'il te faut

- Un compte Supabase.
- Un compte Vercel, relié au dépôt GitHub du studio.
- Environ 20 minutes. Ce temps ne compte ni la migration des données (section 6), ni les contrôles que tu fais ensuite.

## 2. Supabase : créer les deux projets et installer la base

Il faut deux projets Supabase : un projet « studio-test » (pour essayer sans risque) et un projet « studio-reel » (celui que la créatrice utilise vraiment). Répète les étapes ci-dessous pour chacun des deux.

1. Crée le projet. Donne-lui le nom « studio-test » ou « studio-reel », choisis une région proche de toi et note le mot de passe de la base dans ton gestionnaire de mots de passe.
2. Ouvre l'éditeur SQL (menu de gauche, « SQL Editor »). Ouvre le fichier `supabase/schema.sql` du dépôt, copie tout son contenu, colle-le dans l'éditeur et clique sur « Run ». L'éditeur peut te demander une confirmation parce que le script contient `drop policy` : c'est normal, tu peux confirmer. Tu dois ensuite voir un message de réussite, sans erreur en rouge. Ce script peut être relancé sans risque.
3. Va dans Authentication, puis Sign In / Providers (ou un nom voisin). Désactive l'option « Allow new users to sign up ». Ainsi, personne ne peut se créer un accès tout seul.
4. Au même endroit, vérifie que les connexions anonymes (« Allow anonymous sign-ins », ou un nom voisin) sont désactivées.
5. Va dans les réglages API du projet (Settings, puis API, ou un nom voisin) et vérifie la limite « Max rows » (ou un nom voisin). Elle doit rester à 1000 ou plus : ne la baisse jamais sous 1000, sinon le studio ne lirait qu'une partie de ses données.
6. Relève trois informations dans ces mêmes réglages API et garde-les sous la main :
   - l'URL du projet ;
   - la clé publique (`anon` ou `publishable`) ;
   - la clé secrète (`service_role` ou `secret`).

   La clé secrète est très puissante : ne l'envoie jamais par e-mail ou message, et ne la partage avec personne.

Ne crée pas encore les utilisateurs : ils viennent à la section 7, après la migration des données.

## 3. Vercel : créer le projet et saisir les variables

1. Importe le dépôt GitHub du studio dans Vercel (« Add New », puis « Project »).
2. Laisse la commande de build et le dossier de sortie tels que les définit le fichier `vercel.json`. Ne les modifie pas.
3. Va dans Settings, puis Environment Variables, et saisis les variables suivantes.

| Variable | Environnement | Valeur à mettre | Secrète ? |
|---|---|---|---|
| `SUPABASE_URL` | Production : projet réel. Preview : projet de test | L'URL du projet Supabase correspondant | Non, publique |
| `SUPABASE_ANON_KEY` | Production : projet réel. Preview : projet de test | La clé publique du projet correspondant | Non, publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Production : projet réel. Preview : projet de test | La clé secrète du projet correspondant | Oui |
| `CRON_SECRET` | Production et Preview | Une longue chaîne de caractères aléatoires, que tu choisis toi-même (au moins 32 caractères) | Oui |
| `ANTHROPIC_API_KEY` | Production et Preview | Ta clé créée sur console.anthropic.com (facultative, voir la section 8) | Oui |
| `MODELE_CLAUDE` | Production et Preview | Le nom du modèle à utiliser (facultative : sans valeur, le studio prend `claude-opus-4-8`) | Non |

Pour les variables secrètes, coche l'option « Sensitive » quand Vercel te la propose. Pour chaque variable, décoche les environnements qui ne la concernent pas.

4. Lance un déploiement (« Deploy »), ou redéploie si le projet existe déjà. Les variables ne sont prises en compte qu'au déploiement suivant leur saisie.

## 4. Supabase : régler les adresses de retour

Maintenant que le site existe, retourne dans chaque projet Supabase, dans Authentication, puis URL Configuration (ou un nom voisin).

- **Projet réel (« studio-reel ») :** mets l'adresse de production du site Vercel dans « Site URL » et dans « Redirect URLs ».
- **Projet de test (« studio-test ») :** mets dans « Site URL » l'adresse stable de la branche (celle qui reste la même à chaque déploiement de cette branche), pas l'adresse d'un déploiement précis, qui change à chaque fois. Tu la trouves dans Vercel, sur le déploiement de la branche (Domains, ou un nom voisin).
  Dans « Redirect URLs », ajoute cette adresse stable, puis une adresse avec un joker (le signe `*` à la place de la partie qui change) pour les déploiements de prévisualisation. Resserre le joker au plus juste : garde le début (le nom du projet) et la fin (le nom de ton équipe ou de ton compte) tels que Vercel les affiche, et ne mets le joker qu'à l'endroit qui change. Voici un gabarit, avec des emplacements à remplacer : `https://<nom-du-projet>-*-<nom-de-l-equipe>.vercel.app/**`. Reprends la forme exacte des adresses que tu vois dans Vercel (onglet Deployments), car elle peut différer de ce gabarit.
  Vercel peut aussi protéger les prévisualisations par une connexion Vercel : la personne qui ouvre l'adresse doit alors d'abord se connecter à Vercel. Tu peux régler cette protection dans Settings, puis Deployment Protection (ou un nom voisin).

## 5. En local

Le script de migration des données (section 6) se lance depuis ton ordinateur. Il lui faut un petit fichier de réglages.

1. Ouvre un terminal à la racine du dépôt et lance `npm install` une fois.
2. Crée à la racine du dépôt un fichier nommé `.env.local` avec seulement ces deux lignes, remplies avec les valeurs du projet de **test** pendant les essais :

```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

   N'y mets ni la clé Claude ni `CRON_SECRET` : le script n'en a pas besoin.
3. Pour la migration du studio réel, remplace ces deux valeurs par celles du projet réel, puis retire-les dès la migration terminée.
4. Ce fichier n'est jamais envoyé sur GitHub : ne le renomme pas et ne le copie pas ailleurs.

## 6. Migrer les données

Cette étape reprend dans Supabase les données de l'ancien studio : le profil, les fiches, les bulletins, les relevés et les visuels. Elle utilise un script, lancé depuis ton ordinateur.

**Ce qu'il te faut avant de commencer.**

- Node 20.6 ou plus (tape `node --version` dans un terminal pour le savoir).
- Le fichier `.env.local` de la section 5, avec les deux valeurs du projet visé. Lance les commandes depuis la racine du dépôt.
- L'export de l'ancien studio : un fichier `.json`, obtenu avec le bouton « Exporter les données » (ou un nom voisin) de l'ancienne page.
- Le dossier qui contient les visuels. Chaque fichier porte l'identifiant du visuel comme nom, suivi d'une extension : `png`, `jpg`, `webp`, `gif`, `mp4`, `mov` ou `webm`.

**Dans cet ordre.**

1. Commence par le projet de test. Une fois sa migration terminée, crée un utilisateur de test (section 7), ouvre le site de prévisualisation et vérifie que le profil, les fiches et les visuels sont là. Fais le projet réel seulement après ce contrôle. Pour changer de projet, remplace les deux valeurs de `.env.local`.
2. Lance d'abord la simulation, qui n'écrit rien :

```
node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> --visuels <dossier> --simuler
```

3. Lis le résultat. La ligne « Cible : … » doit montrer le projet voulu : si ce n'est pas le bon, arrête-toi et corrige `.env.local`. Regarde aussi le décompte par collection : il doit contenir « profil : 1 ». S'il manque, ton export n'a pas de profil.
4. Quand tout est juste, relance la même commande sans `--simuler` :

```
node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> --visuels <dossier>
```

5. Vérifie que le script se termine par « Migration terminée ».

**À savoir.**

- Migre une seule fois, avant de donner l'accès aux utilisateurs.
- Le script refuse d'écrire si la cible contient déjà des documents de l'export. C'est voulu : il protège ce qui existe.
- L'option `--ecraser` ne sert qu'à reprendre une migration interrompue. Ne l'utilise pas autrement.
- Ne relance jamais la migration une fois le studio utilisé sur Vercel, sans avoir d'abord exporté les données depuis la page : elle remplacerait le travail récent.
- Une faute de frappe dans une option arrête le script avant toute lecture ou écriture. Relis le message et corrige la commande.
- Quand c'est fini, retire les valeurs du projet réel de `.env.local`.

## 7. Supabase : créer les utilisateurs

Fais cette étape dans chaque projet après la migration de ses données (section 6) et le réglage des adresses de retour (section 4). Créer un utilisateur, c'est donner l'accès au studio.

Le service d'e-mail intégré de Supabase n'envoie des messages qu'aux adresses qui sont membres de l'organisation du projet Supabase, et seulement quelques messages par heure. Il y a donc deux façons de laisser quelqu'un se connecter.

**Avec un mot de passe (le plus simple).**

1. Va dans Authentication, puis Users.
2. Clique sur « Add user » (ou un nom voisin), puis choisis la création d'un utilisateur avec une adresse et un mot de passe.
3. Saisis l'adresse de la personne et un mot de passe, et coche l'option « Auto Confirm User » (ou un nom voisin).
4. Transmets le mot de passe à la personne par un moyen sûr. L'écran de connexion du studio accepte l'adresse et le mot de passe.
5. Le studio n'a ni changement ni réinitialisation de mot de passe. C'est l'administrateur qui le change dans Supabase : Authentication, puis Users, puis le menu de la personne (ou un nom voisin).

**Avec un lien magique.**

1. Vérifie d'abord que l'adresse peut recevoir le message : soit elle est membre de l'organisation Supabase, soit tu as configuré un service d'envoi (SMTP personnalisé) dans les réglages d'e-mail d'Authentication. Sans cela, le lien n'arrive pas.
2. Ensuite seulement, va dans Authentication, puis Users, et clique sur « Invite user » pour chaque adresse autorisée.

## 8. Allumer l'évaluation et la veille plus tard

L'évaluation et la veille utilisent Claude. Elles restent éteintes tant qu'il n'y a pas de clé. Quand tu veux les activer :

1. Crée une clé sur console.anthropic.com.
2. Ajoute-la dans Vercel, dans Settings, Environment Variables, sous le nom `ANTHROPIC_API_KEY`.
3. Redéploie le site pour qu'elle soit prise en compte. Toute variable ajoutée ou modifiée ne prend effet qu'après un redéploiement.
4. Pour la veille, vérifie que `SUPABASE_SERVICE_ROLE_KEY` est saisie (section 3) : la veille en a besoin en plus de la clé Claude.
5. Désactive la routine cloud d'origine au moment même où tu allumes la veille sur Vercel. Sinon, tu auras deux veilles.

## 9. La veille planifiée

- Elle ne tourne que sur le déploiement de production, pas sur les prévisualisations.
- Vercel envoie lui-même le secret `CRON_SECRET` quand il la déclenche : tu n'as rien à régler de plus que la variable de la section 3.
- Le fichier `vercel.json` prévoit deux déclenchements, le lundi à 00 h et à 01 h (heure UTC). Ils sont pensés pour un profil à l'heure de l'Est : dimanche 20 h, en heure d'été comme en heure d'hiver. Un seul des deux tombe à 20 h, l'autre est ignoré par le studio.
- Sur l'offre gratuite, l'heure exacte est approximative : Vercel déclenche dans l'heure, pas à la minute près.
- Si le profil utilise un autre fuseau horaire, les horaires de `vercel.json` sont à revoir.

## 10. Les durées des fonctions

La veille demande jusqu'à 300 secondes, et l'évaluation jusqu'à 120 secondes. Ces durées sont déjà inscrites dans `vercel.json`.

Pour vérifier ce que ton offre accepte, ouvre les réglages du projet dans Vercel, puis la partie Functions (ou un nom voisin). Regarde la durée maximale et l'option « Fluid Compute » (ou un nom voisin).

Si ton offre plafonne plus bas que 300 secondes, la veille peut être coupée avant la fin. Rien n'est alors écrit : le bulletin reste tel qu'il était.

## 11. En cas de problème

- **Le lien magique n'arrive jamais.** Regarde dans les courriers indésirables, puis vérifie que l'adresse existe dans Authentication, Users. Si l'adresse n'est pas membre de l'organisation Supabase, utilise la connexion par mot de passe, ou configure le SMTP (voir la section 7).
- **Le lien magique ouvert sur un autre appareil.** La session s'ouvre sur l'appareil où tu as cliqué le lien, pas sur celui où tu l'as demandé. C'est normal : ouvre le lien sur l'appareil que tu veux utiliser.
- **Le message « Cette adresse n’a pas accès au studio. » s'affiche.** Cette adresse n'a pas été créée ou invitée. Ajoute-la dans Authentication, puis Users.
- **Page blanche.** Vérifie dans Vercel que `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont bien saisies pour l'environnement concerné, puis redéploie.
- **Le projet Supabase gratuit est en pause.** Un projet gratuit se met en pause après une période sans activité. Ouvre le tableau de bord Supabase, trouve le projet et réactive-le. Le studio revient après quelques minutes.
- **Le bouton « Évaluer » n'apparaît pas après l'ajout de la clé.** La clé n'est prise en compte qu'au déploiement suivant : redéploie le site (section 8).
- **Le message « Ce lien n’est plus valable » s'affiche.** Le lien magique dure une heure et ne sert qu'une fois. Demande-en un nouveau depuis l'écran de connexion.
- **Le stockage gratuit se remplit.** L'offre gratuite limite l'espace de stockage. Surveille-le dans Supabase, surtout si tu ajoutes des vidéos, qui sont lourdes.
