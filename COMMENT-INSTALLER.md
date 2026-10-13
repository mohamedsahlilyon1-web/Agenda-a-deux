# Installer Agenda à Deux sur vos deux iPhone

C'est gratuit : pas d'App Store, pas de Mac, pas de compte développeur. Il faut un ordinateur (même un PC Windows), une seule fois, pendant environ 20 minutes. Ensuite, tout se passe sur les iPhone.

## Étape 1. Créer la synchronisation (Firebase, gratuit, 10 min)

Firebase est le service de Google qui garde votre agenda commun et le synchronise entre vos deux téléphones.

1. Va sur https://console.firebase.google.com et connecte-toi avec un compte Google.
2. Touche **Créer un projet**, nomme-le `agenda-a-deux`. Tu peux désactiver Google Analytics.
3. Menu de gauche : **Créer > Authentication > Commencer**. Dans l'onglet **Mode de connexion**, active **Anonyme**, puis **Enregistrer**.
4. Menu de gauche : **Créer > Firestore Database > Créer une base de données**. Emplacement **eur3 (Europe)**, puis **Démarrer en mode production**.
5. Dans Firestore, onglet **Règles** : efface tout, colle le contenu du fichier `firestore.rules` de ce dossier, puis **Publier**.
6. Roue dentée en haut à gauche > **Paramètres du projet**. En bas, dans **Vos applications**, touche l'icône **</>** (Web). Nom : `agenda`. N'active pas Firebase Hosting. Valide.
7. Firebase affiche un bloc `firebaseConfig` avec `apiKey`, `authDomain`, etc.
8. Ouvre le fichier `config.js` de ce dossier avec le Bloc-notes et recopie chaque valeur entre les guillemets. Enregistre.

## Étape 2. Mettre l'app en ligne (Netlify, gratuit, 5 min)

1. Crée un compte gratuit sur https://www.netlify.com.
2. Va sur https://app.netlify.com/drop.
3. Glisse le **dossier entier** de l'app (celui qui contient `index.html`) dans la zone de dépôt.
4. Netlify te donne une adresse du type `https://nom-au-hasard.netlify.app`. Tu peux la renommer dans **Site configuration > Change site name**, par exemple `agenda-mohamed.netlify.app`.
5. De retour dans Firebase : **Authentication > Paramètres > Domaines autorisés > Ajouter un domaine**, puis colle ton adresse Netlify sans `https://`.

## Étape 3. Installer l'app sur chaque iPhone (2 min)

1. Ouvre ton adresse Netlify dans **Safari**. Ça ne marche pas depuis Chrome ni depuis un lien ouvert dans une autre app.
2. Touche le bouton **Partager** (le carré avec une flèche vers le haut), puis **Sur l'écran d'accueil**, puis **Ajouter**.
3. L'icône **Agenda à Deux** apparaît sur l'écran d'accueil. Ouvre l'app **depuis cette icône**, pas depuis Safari.
4. **Ton iPhone** : entre ton prénom, puis **Créer notre agenda**. Un code de 6 caractères s'affiche. Touche **Envoyer l'invitation** pour le transmettre.
5. **L'iPhone de ta compagne** : elle fait les points 1 à 3, entre son prénom, puis le code dans **J'ai reçu un code**.

C'est prêt : tout ce que l'un ajoute ou modifie apparaît aussitôt chez l'autre.

## Premiers réglages conseillés

- **⚙︎ > Nos domiciles** : ajoute la Maison avec son adresse complète. Tous les trajets partent de là.
- **⚙︎ > Nos destinations** : Dentiste, Travail, amis… Il suffira ensuite d'écrire ou de dire « dentiste vendredi 14h30 ».
- **⚙︎ > Nos enseignes** : coche Action, Carrefour, etc. pour retrouver les magasins les plus proches.

## Parler au lieu d'écrire

Touche le **micro rond** en bas de l'écran, puis dis par exemple « dentiste vendredi 14h30 ». L'app écrit ce que tu dis, puis prépare l'évènement toute seule quand tu as fini.

La première fois, l'iPhone demande l'autorisation d'utiliser le micro : réponds **Autoriser**. Si rien ne se passe, vérifie dans **Réglages > Général > Clavier** que **Dictée** est activée, et dans **Réglages > Apps > Safari** que le **Micro** est autorisé.

## Rappels

Les rappels de l'app sont affichés dans chaque évènement. Pour qu'ils **sonnent même quand l'app est fermée**, ouvre l'évènement et touche **Calendrier iPhone** : l'évènement est ajouté à ton calendrier avec ses alarmes (la veille, l'heure de départ…). Chacun le fait sur son téléphone. L'app indique ensuite qui l'a déjà ajouté.

## Mettre à jour l'app plus tard

Si je te donne une nouvelle version : sur Netlify, ouvre ton site, onglet **Deploys**, et glisse le nouveau dossier dans la zone prévue. Garde ton `config.js` rempli. Les iPhone récupèrent la nouvelle version à la prochaine ouverture de l'app (ferme-la et rouvre-la si besoin). Vos évènements ne sont pas touchés.

## Services utilisés (tous gratuits)

- Adresses : Base Adresse Nationale et Géoplateforme de l'IGN
- Itinéraires et durées : service d'itinéraire de l'IGN
- Carte et magasins : OpenStreetMap
- Synchronisation : Firebase (Google), plan gratuit
