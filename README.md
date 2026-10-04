<div align="center">

<img src="assets/logo.svg" alt="Pill" width="96" height="96">

# Pill

### Une capsule flottante pour macOS

<img src="assets/pill.svg" alt="Aperçu de la capsule" width="300">

L'heure, l'historique de ton presse-papiers, des minuteurs, des notes et un lanceur, toujours à portée de clic.<br>
Glisse la capsule où tu veux, clique pour l'ouvrir.

[**Installer Pill**](#installer) &nbsp;·&nbsp; [Voir les onglets](#six-onglets-une-capsule) &nbsp;·&nbsp; [Raccourcis](#au-bout-des-doigts)

</div>

<br>

## Six onglets, une capsule

Ouvre la capsule et choisis.

| Onglet | Ce qu'il fait |
| :-- | :-- |
| **Copies** | L'historique de ton presse-papiers, avec recherche et éléments épinglés qui ne disparaissent jamais. Pill reconnaît ce que tu copies et propose l'action qui va avec : écrire à une adresse, ouvrir un lien, appeler un numéro. |
| **Temps** | Un minuteur, un chronomètre avec tours et un Pomodoro (quatre sessions de focus, des pauses courtes, puis une longue). Quand un minuteur tourne, il remplace l'horloge dans la capsule fermée. À la fin : notification, son, et la capsule clignote. |
| **Notes** | Des tâches avec une échéance facultative, et des notes rapides que tu modifies d'un clic. <kbd>⌘↵</kbd> ajoute la note. |
| **Système** | Processeur, mémoire et batterie, mis à jour toutes les deux secondes tant que l'onglet est ouvert. |
| **Lancer** | Tape le nom d'une app ou d'un fichier, ou une adresse web. <kbd>↵</kbd> ouvre, <kbd>⌘↵</kbd> l'affiche dans le Finder. Un calcul tapé ici est résolu sur place, et <kbd>↵</kbd> copie le résultat. |
| **Calcul** | Une calculatrice qui se pilote à l'écran ou au clavier, avec pourcentages et parenthèses. Touche le résultat pour le copier. |

Dans **Copies**, Pill reconnaît : `Adresse e-mail` `Lien` `Téléphone` `Couleur` `Calcul` `Code`

Le bouton **Style**, à droite de la recherche, règle le thème, l'opacité et la taille de la capsule.

<br>

## Au bout des doigts

Pill se commande presque sans y penser.

| Raccourci | Action |
| :-- | :-- |
| <kbd>⌃⌥V</kbd> | Ouvrir ou fermer l'historique, depuis n'importe quelle app |
| <kbd>⌃⌥Espace</kbd> | Ouvrir le lanceur |
| <kbd>Clic</kbd> | Ouvrir ou refermer la capsule |
| <kbd>2 clics</kbd> | Aimanter la capsule au bord d'écran le plus proche |
| <kbd>↑</kbd> <kbd>↓</kbd> | Choisir un élément, <kbd>↵</kbd> pour l'utiliser |
| <kbd>Échap</kbd> | Effacer la recherche, puis fermer |

Les raccourcis globaux se changent avec les constantes `SHORTCUT` et `LAUNCH_SHORTCUT` en haut de `main.js`.

Autres gestes : **glisser** la capsule pour la déplacer, **épingler** un élément (icône au survol) pour qu'il reste en haut et survive à « Vider », et l'**icône de la barre de menus** pour ouvrir l'historique, masquer la capsule, mettre en pause, activer le collage au clic, le démarrage auto, vider ou quitter.

<br>

## Ce que tu copies reste à toi

L'historique (20 éléments non épinglés max), les notes, les tâches et les réglages des minuteurs sont enregistrés dans `~/Library/Application Support/pill`. Les copies que ton gestionnaire de mots de passe marque comme confidentielles sont ignorées quand il les signale.

Pour le reste, **Pause** arrête l'enregistrement (un petit point s'affiche à côté de l'heure) et **Vider** efface tout sauf les éléments épinglés.

<br>

## Installer

### L'essayer

```bash
npm install
npm start
```

`PILL_DEBUG=1 npm start` ouvre la console de débogage.

### Créer l'app

```bash
npm run dist
```

Le fichier `.dmg` arrive dans le dossier `dist/`. L'app n'est pas signée : au premier lancement, fais clic droit sur Pill, puis Ouvrir. Si macOS annonce une app endommagée, lance `xattr -cr /Applications/Pill.app` dans le Terminal.

### Coller directement

Pour envoyer <kbd>⌘V</kbd> à l'app active, macOS demande une fois l'autorisation **Accessibilité** (Réglages Système, Confidentialité et sécurité, Accessibilité). Sans elle, l'élément est simplement copié. Tu peux désactiver l'option avec le bouton **Coller** ou dans le menu de la barre de menus.

<br>

## Fichiers

| Fichier | Rôle |
| :-- | :-- |
| `main.js` | Processus principal : fenêtre, presse-papiers, sauvegarde, barre de menus, raccourcis, lanceur |
| `preload.js` | Pont sécurisé entre l'interface et le processus principal |
| `index.html` | Interface : horloge, recherche, historique, onglets, calculatrice |
| `README.html` | Présentation de l'app sous forme de page web |
| `assets/` | Icône de la barre de menus, logo et aperçu du README |
| `build/icon.png` | Icône de l'app |
| `fonts/BebasNeue-Regular.ttf` | Police Bebas Neue (Ryoichi Tsunekawa, licence SIL OFL), à télécharger sur Google Fonts. Sans elle, Pill utilise la police du système |
| `PillApp.swift` | Ancien prototype SwiftUI, non utilisé par l'app Electron |

<br>

<div align="center">

Pill 0.5.0, sous licence MIT.

</div>
