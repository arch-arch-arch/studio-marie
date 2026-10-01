# Mise en service : Vercel et Supabase

Ce guide t'explique, pas à pas, comment installer le studio sur Vercel (le site) et Supabase (la base de données, la connexion et le stockage des images). Tu n'as besoin d'aucune compétence technique : il suffit de suivre les étapes dans l'ordre. Les noms des boutons et des menus peuvent varier un peu selon la version de l'interface : cherche alors le nom le plus proche.

## 1. Ce qu'il te faut

- Un compte Supabase.
- Un compte Vercel, relié au dépôt GitHub du studio.
- Environ 20 minutes.

## 2. Supabase : créer les deux projets et installer la base

Il faut deux projets Supabase : un projet « studio-test » (pour essayer sans risque) et un projet « studio-reel » (celui que la créatrice utilise vraiment). Répète les étapes ci-dessous pour chacun des deux.

1. Crée le projet. Donne-lui le nom « studio-test » ou « studio-reel », choisis une région proche de toi et note le mot de passe de la base dans ton gestionnaire de mots de passe.
2. Ouvre l'éditeur SQL (menu de gauche, « SQL Editor »). Ouvre le fichier `supabase/schema.sql` du dépôt, copie tout son contenu, colle-le dans l'éditeur et clique sur « Run ». L'éditeur peut te demander une confirmation parce que le script contient `drop policy` : c'est normal, tu peux confirmer. Tu dois ensuite voir un message de réussite, sans erreur en rouge. Ce script peut être relancé sans risque.
3. Va dans Authentication, puis Sign In / Providers (ou un nom voisin). Désactive l'option « Allow new users to sign up ». Ainsi, personne ne peut se créer un accès tout seul.
4. Au même endroit, vérifie que les connexions anonymes (« Allow anonymous sign-ins », ou un nom voisin) sont désactivées.
5. Relève trois informations dans les réglages API du projet (Settings, puis API, ou un nom voisin) et garde-les sous la main :
   - l'URL du projet ;
   - la clé publique (`anon` ou `publishable`) ;
   - la clé secrète (`service_role` ou `secret`).

   La clé secrète est très puissante : ne l'envoie jamais par e-mail ou message, et ne la partage avec personne.

Ne crée pas encore les utilisateurs : ils viennent à la section 5.

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
| `ANTHROPIC_API_KEY` | Production et Preview | Ta clé créée sur console.anthropic.com (facultative, voir la section 7) | Oui |
| `MODELE_CLAUDE` | Production et Preview | Le nom du modèle à utiliser (facultative : sans valeur, le studio prend `claude-opus-4-8`) | Non |

Pour les variables secrètes, coche l'option « Sensitive » quand Vercel te la propose. Pour chaque variable, décoche les environnements qui ne la concernent pas.

4. Lance un déploiement (« Deploy »), ou redéploie si le projet existe déjà. Les variables ne sont prises en compte qu'au déploiement suivant leur saisie.

## 4. Supabase : régler les adresses de retour

Maintenant que le site existe, retourne dans chaque projet Supabase, dans Authentication, puis URL Configuration (ou un nom voisin).

- **Projet réel (« studio-reel ») :** mets l'adresse de production du site Vercel dans « Site URL » et dans « Redirect URLs ».
- **Projet de test (« studio-test ») :** mets l'adresse de prévisualisation dans « Site URL ». Dans « Redirect URLs », ajoute cette adresse avec un joker (le signe `*` à la place de la partie qui change), car les adresses de prévisualisation changent à chaque déploiement. Voici un gabarit, avec des emplacements à remplacer : `https://<nom-du-projet>-*.vercel.app/**`. Reprends la forme exacte des adresses de prévisualisation que tu vois dans Vercel (onglet Deployments), car elle peut différer de ce gabarit.

## 5. Supabase : créer les utilisateurs

Fais cette étape en dernier, dans chaque projet, une fois les adresses de retour réglées.

Le service d'e-mail intégré de Supabase n'envoie des messages qu'aux adresses qui sont membres de l'organisation du projet Supabase, et seulement quelques messages par heure. Il y a donc deux façons de laisser quelqu'un se connecter.

**Avec un mot de passe (le plus simple).**

1. Va dans Authentication, puis Users.
2. Clique sur « Add user » (ou un nom voisin), puis choisis la création d'un utilisateur avec une adresse et un mot de passe.
3. Saisis l'adresse de la personne et un mot de passe, et coche l'option « Auto Confirm User » (ou un nom voisin).
4. Transmets le mot de passe à la personne par un moyen sûr. L'écran de connexion du studio accepte l'adresse et le mot de passe.

**Avec un lien magique.**

1. Vérifie d'abord que l'adresse peut recevoir le message : soit elle est membre de l'organisation Supabase, soit tu as configuré un service d'envoi (SMTP personnalisé) dans les réglages d'e-mail d'Authentication. Sans cela, le lien n'arrive pas.
2. Ensuite seulement, va dans Authentication, puis Users, et clique sur « Invite user » pour chaque adresse autorisée.

## 6. En local

1. À la racine du dépôt, copie le fichier `.env.example` et nomme la copie `.env.local`.
2. Ouvre `.env.local` et remplis les valeurs avec celles du projet de **test** pendant les essais.
3. Pour la migration du studio réel, mets-y temporairement les valeurs du projet réel, puis retire-les dès la migration terminée.
4. Ce fichier sert seulement au script de migration des données. Il n'est jamais envoyé sur GitHub : ne le renomme pas et ne le copie pas ailleurs.

## 7. Allumer l'évaluation et la veille plus tard

L'évaluation et la veille utilisent Claude. Elles restent éteintes tant qu'il n'y a pas de clé. Quand tu veux les activer :

1. Crée une clé sur console.anthropic.com.
2. Ajoute-la dans Vercel, dans Settings, Environment Variables, sous le nom `ANTHROPIC_API_KEY`.
3. Redéploie le site pour qu'elle soit prise en compte.

## 8. En cas de problème

- **Le lien magique n'arrive jamais.** Regarde dans les courriers indésirables, puis vérifie que l'adresse existe dans Authentication, Users. Si l'adresse n'est pas membre de l'organisation Supabase, utilise la connexion par mot de passe, ou configure le SMTP (voir la section 5).
- **Le lien magique ouvert sur un autre appareil.** La session s'ouvre sur l'appareil où tu as cliqué le lien, pas sur celui où tu l'as demandé. C'est normal : ouvre le lien sur l'appareil que tu veux utiliser.
- **Le message « Cette adresse n’a pas accès au studio. » s'affiche.** Cette adresse n'a pas été créée ou invitée. Ajoute-la dans Authentication, puis Users.
- **Page blanche.** Vérifie dans Vercel que `SUPABASE_URL` et `SUPABASE_ANON_KEY` sont bien saisies pour l'environnement concerné, puis redéploie.
