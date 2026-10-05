# Pill

Une capsule flottante pour macOS : une horloge animée, l'historique de ton presse-papiers, des minuteurs, des notes, l'état du système et un lanceur, toujours à portée de clic.

## Utilisation

- **Glisser** la capsule pour la déplacer.
- **Clic** pour l'ouvrir ou la refermer. **Double-clic** pour l'aimanter au bord d'écran le plus proche.
- **Raccourci global** `⌃⌥V` (Control + Option + V) pour ouvrir ou fermer l'historique depuis n'importe quelle app. Pour le changer, modifie la constante `SHORTCUT` en haut de `main.js`.
- **Icône dans la barre de menus** : ouvrir l'historique, masquer la capsule, pause, coller au clic, démarrage auto, vider, quitter.
- **Recherche** : à l'ouverture, tape directement. `↑` `↓` pour choisir, `Entrée` pour utiliser l'élément, `Échap` pour effacer la recherche puis fermer.
- **Épingler** (icône au survol d'un élément) : les éléments épinglés restent en haut, ne sont jamais supprimés automatiquement et survivent à « Vider ».
- **Clic sur un élément** : il est recopié et, si **Coller** est activé, collé directement dans l'app active.
- **Pause** arrête l'enregistrement (un petit point s'affiche à côté de l'heure). **Vider** efface l'historique, sauf les épinglés. **Démarrage** lance Pill à l'ouverture de session (app installée uniquement).

## Onglets

Quand la capsule est ouverte, une rangée d'onglets donne accès à :

- **Copies** : l'historique du presse-papiers. Le bouton **Style** (à droite de la recherche) règle le thème, l'opacité et la taille de la capsule.
- **Temps** : **minuteur**, **chronomètre** (avec tours) et **Pomodoro** (4 sessions de focus, pauses courtes, puis une pause longue ; les durées sont réglables). Quand un minuteur tourne, il remplace l'horloge dans la capsule réduite. À la fin, Pill envoie une notification, joue un son et fait clignoter la capsule.
- **Notes** : **tâches** (avec échéance facultative) et **notes rapides** (clic sur une note pour la modifier, `⌘↵` pour ajouter).
- **Système** : processeur, mémoire et batterie, mis à jour toutes les 2 secondes tant que l'onglet est ouvert.
- **Lancer** : tape le nom d'une app ou d'un fichier, ou une adresse web. `↑` `↓` pour choisir, `Entrée` pour ouvrir, `⌘Entrée` pour l'afficher dans le Finder. Raccourci global `⌃⌥Espace` (constante `LAUNCH_SHORTCUT` en haut de `main.js`).

Les notes, tâches et réglages de minuteur sont enregistrés en clair dans `~/Library/Application Support/pill`.

## Coller directement : autorisation macOS

Pour envoyer Cmd+V à l'app active, macOS demande l'autorisation **Accessibilité** la première fois (Réglages Système, Confidentialité et sécurité, Accessibilité). Sans elle, l'élément est simplement copié. Tu peux désactiver l'option avec le bouton **Coller** ou dans le menu de la barre de menus.

## Confidentialité

L'historique (20 éléments non épinglés max) est sauvegardé en clair dans `~/Library/Application Support/pill`. Les copies marquées « confidentielles » par les gestionnaires de mots de passe sont ignorées quand le gestionnaire les signale. Pour les autres cas, utilise **Pause** ou **Vider**.

## Lancer en développement

```
npm install
npm start
```

`PILL_DEBUG=1 npm start` ouvre la console de débogage.

## Créer l'app installable

```
npm install
npm run dist
```

Le fichier `.dmg` est créé dans le dossier `dist/`. L'app n'est pas signée : au premier lancement, fais clic droit sur Pill, puis Ouvrir. Si macOS affiche « app endommagée », exécute `xattr -cr /Applications/Pill.app` dans le Terminal.

## Fichiers

- `main.js` : processus principal (fenêtre, presse-papiers, sauvegarde, barre de menus, raccourci)
- `preload.js` : pont sécurisé entre l'interface et le processus principal
- `index.html` : interface (horloge, recherche, historique, barre d'actions)
- `assets/` : icône de la barre de menus
- `build/icon.png` : icône de l'app
- `fonts/BebasNeue-Regular.ttf` : police Bebas Neue (Ryoichi Tsunekawa, licence SIL OFL), utilisée pour l'horloge et les boutons. À télécharger sur Google Fonts. Sans ce fichier, Pill utilise la police du système.
- `PillApp.swift` : ancien prototype SwiftUI, non utilisé par l'app Electron
