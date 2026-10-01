# Mise en service : Vercel et Supabase

Ce guide t'explique, pas à pas, comment installer le studio sur Vercel (le site) et Supabase (la base de données, la connexion et le stockage des images). Tu n'as besoin d'aucune compétence technique : il suffit de suivre les étapes dans l'ordre.

## 1. Ce qu'il te faut

- Un compte Supabase.
- Un compte Vercel, relié au dépôt GitHub du studio.
- Environ 20 minutes.

## 2. Supabase, deux fois

Il faut deux projets Supabase : un projet « studio-test » (pour essayer sans risque) et un projet « studio-reel » (celui que la créatrice utilise vraiment). Répète les étapes ci-dessous pour chacun des deux.

1. Crée le projet. Donne-lui le nom « studio-test » ou « studio-reel », choisis une région proche de toi et note le mot de passe de la base dans ton gestionnaire de mots de passe.
2. Ouvre l'éditeur SQL (menu de gauche, « SQL Editor »). Ouvre le fichier `supabase/schema.sql` du dépôt, copie tout son contenu, colle-le dans l'éditeur et clique sur « Run ». Tu dois voir un message de réussite, sans erreur en rouge.
3. Va dans Authentication, puis Sign In / Providers. Désactive l'option « Allow new users to sign up ». Ainsi, personne ne peut se créer un accès tout seul.
4. Va dans Authentication, puis Users. Clique sur « Invite user » et invite chaque adresse e-mail autorisée à entrer dans le studio, une par une.
5. Va dans Authentication, puis URL Configuration. Mets l'adresse du site Vercel dans « Site URL », puis ajoute la même adresse dans « Redirect URLs ». Si tu as déjà une adresse pour les prévisualisations, ajoute-la aussi dans « Redirect URLs » du projet de test.
6. Va dans Settings, puis API. Relève trois informations et garde-les sous la main : l'URL du projet, la clé `anon` et la clé `service_role`. La clé `service_role` est très puissante : ne l'envoie jamais par e-mail ou message, et ne la partage avec personne.

## 3. Vercel

1. Importe le dépôt GitHub du studio dans Vercel (« Add New », puis « Project »).
2. Laisse la commande de build et le dossier de sortie tels que les définit le fichier `vercel.json`. Ne les modifie pas.
3. Va dans Settings, puis Environment Variables, et saisis les variables suivantes.

| Variable | Environnement | Valeur à mettre | Secrète ? |
|---|---|---|---|
| `SUPABASE_URL` | Production : projet réel. Preview : projet de test | L'URL du projet Supabase correspondant | Non, publique |
| `SUPABASE_ANON_KEY` | Production : projet réel. Preview : projet de test | La clé `anon` du projet correspondant | Non, publique |
| `SUPABASE_SERVICE_ROLE_KEY` | Production : projet réel. Preview : projet de test | La clé `service_role` du projet correspondant | Oui |
| `CRON_SECRET` | Production et Preview | Une longue chaîne de caractères aléatoires, que tu choisis toi-même (au moins 32 caractères) | Oui |
| `ANTHROPIC_API_KEY` | Production et Preview | Ta clé créée sur console.anthropic.com (facultative, voir l'étape 5) | Oui |
| `MODELE_CLAUDE` | Production et Preview | Le nom du modèle à utiliser (facultative : sans valeur, le studio prend `claude-opus-4-8`) | Non |

Pour les variables secrètes, coche l'option « Sensitive » quand Vercel te la propose. Pour chaque variable, décoche les environnements qui ne la concernent pas.

4. Lance un déploiement (« Deploy »), ou redéploie si le projet existe déjà. Les variables ne sont prises en compte qu'au déploiement suivant leur saisie.

## 4. En local

1. À la racine du dépôt, copie le fichier `.env.example` et nomme la copie `.env.local`.
2. Ouvre `.env.local` et remplis les valeurs avec celles du projet de **test**, jamais celles du projet réel.
3. Ce fichier sert seulement au script de migration des données. Il n'est jamais envoyé sur GitHub : ne le renomme pas et ne le copie pas ailleurs.

## 5. Allumer l'évaluation et la veille plus tard

L'évaluation et la veille utilisent Claude. Elles restent éteintes tant qu'il n'y a pas de clé. Quand tu veux les activer :

1. Crée une clé sur console.anthropic.com.
2. Ajoute-la dans Vercel, dans Settings, Environment Variables, sous le nom `ANTHROPIC_API_KEY`.
3. Redéploie le site pour qu'elle soit prise en compte.

## 6. En cas de problème

- **Le lien magique n'arrive pas.** Regarde dans les courriers indésirables. Vérifie ensuite dans Supabase (Authentication, puis Users) que l'adresse a bien été invitée. Attends quelques minutes avant de redemander un lien.
- **Le lien magique ouvert sur un autre appareil.** La session s'ouvre sur l'appareil où tu as cliqué le lien, pas sur celui où tu l'as demandé. C'est normal : ouvre le lien sur l'appareil que tu veux utiliser.
- **Le message « Cette adresse n’a pas accès au studio. » s'affiche.** Cette adresse n'a pas été invitée. Invite-la dans Authentication, puis Users, avec « Invite user ».
- **Page blanche.** Vérifie dans Vercel que `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont bien saisies pour l'environnement concerné, puis redéploie.
