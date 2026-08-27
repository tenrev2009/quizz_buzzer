# Déploiement sur un VPS avec Coolify

L'application est un site statique : `npm run build` produit un dossier `dist/`
servi par nginx. Il n'y a pas de serveur applicatif à faire tourner — Supabase
reste hébergé chez Supabase, et rien ne change de ce côté.

Le dépôt contient le `Dockerfile` et le `nginx.conf` nécessaires. Coolify n'a
donc rien à deviner.

## 1. Créer la ressource

Dans Coolify : **New Resource** → **Application** → sélectionner le dépôt
`tenrev2009/quizz_buzzer`, branche `main`.

Réglages :

| Champ | Valeur |
|---|---|
| Build Pack | **Dockerfile** |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `80` |

Ne pas choisir « Static Site » : ce mode utilise sa propre configuration nginx,
sans la redirection dont l'application a besoin (voir §5).

## 2. Variables d'environnement — le point à ne pas rater

Ajouter les trois variables ci-dessous, **en cochant « Build Variable » sur
chacune**.

| Nom | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | `https://tfssvxmrcuaxxubqllcf.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | la clé `anon` du projet Supabase |
| `VITE_SPOTIFY_CLIENT_ID` | `9de5da01362041e69d3213feaea7b830` |

Vite fige ces valeurs **dans le bundle au moment de la construction**. Une
variable fournie seulement au démarrage du conteneur arrive trop tard : le
JavaScript est déjà écrit, et l'application ne sait plus joindre Supabase.

Le `Dockerfile` fait échouer la construction si `VITE_SUPABASE_URL` ou
`VITE_SUPABASE_ANON_KEY` sont vides. Un build rouge avec un message explicite
vaut mieux qu'une application qui se charge et échoue à chaque requête sans
dire pourquoi.

Ces trois valeurs sont publiques par nature : elles sont servies à chaque
visiteur dans le bundle. La clé `anon` n'est pas un secret — la sécurité repose
sur les règles RLS de la base. Ne jamais mettre ici la clé `service_role`.

## 3. Domaine et HTTPS

Renseigner le domaine dans **Domains** (ex. `https://quiz.mondomaine.fr`).
Coolify obtient et renouvelle le certificat Let's Encrypt automatiquement, à
condition que le DNS pointe déjà vers l'IP du VPS.

HTTPS n'est pas optionnel ici : le SDK Spotify et son authentification le
refusent en clair. Sans domaine et sans certificat, le buzzer et le QCM
fonctionneront, mais pas le mode musical.

## 4. Déclarer l'URL de retour Spotify

Dans le dashboard Spotify Developer, ajouter aux **Redirect URIs** :

```
https://quiz.mondomaine.fr/spotify-callback
```

en remplaçant par le domaine réel. Conserver les entrées existantes
(`http://127.0.0.1:5173/spotify-callback` pour le développement local).

L'application construit cette URL à partir du domaine courant : elle doit
correspondre au caractère près, sinon Spotify refuse l'autorisation.

## 5. Pourquoi un Dockerfile plutôt que le mode « Static Site »

Le routage de l'application se fait dans le navigateur. Le chemin
`/spotify-callback` ne correspond à aucun fichier sur le disque : après
autorisation, Spotify y renvoie l'utilisateur, et un serveur qui cherche un
fichier de ce nom répond 404.

Le `nginx.conf` du dépôt contient la règle qui règle cela :

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Il fixe aussi les en-têtes de cache : cache long pour `/assets/` dont les noms
de fichiers portent un hash, aucun cache pour `index.html`, qui doit toujours
pointer vers le dernier bundle après un déploiement.

## 6. Vérifier après le déploiement

```bash
# La page se charge
curl -I https://quiz.mondomaine.fr

# La redirection SPA fonctionne : doit répondre 200 et du HTML,
# pas 404. C'est le test qui compte le plus.
curl -I https://quiz.mondomaine.fr/spotify-callback

# Les variables ont bien été figées dans le bundle : doit afficher
# l'URL Supabase. Si la commande ne renvoie rien, l'option
# « Build Variable » n'était pas cochée (voir §2).
curl -s https://quiz.mondomaine.fr | grep -o '/assets/index-[^"]*\.js' \
  | head -1 | xargs -I{} curl -s https://quiz.mondomaine.fr{} \
  | grep -o 'https://[a-z0-9]*\.supabase\.co' | head -1
```

Puis, dans l'application : se connecter en administrateur, ouvrir une session
en mode musical et vérifier que la connexion Spotify aboutit. C'est le seul
test qui exerce à la fois HTTPS, la redirection SPA et l'URL de retour.

## 7. Déploiements suivants

Un `git push` sur `main` suffit si le déploiement automatique est activé dans
Coolify. Sinon, bouton **Redeploy**.

Les migrations Supabase ne sont pas concernées : elles s'appliquent depuis
Bolt ou le SQL Editor, indépendamment de ce déploiement.
