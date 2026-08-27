# Construction du bundle, puis service en statique.
#
# Les variables VITE_* sont figees DANS le bundle au moment du build : elles
# doivent donc etre presentes ici, pas au demarrage du conteneur. Dans Coolify,
# cochez « Build Variable » sur chacune, sinon elles arrivent vides et l'appli
# se lance sans savoir joindre Supabase.

FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_SPOTIFY_CLIENT_ID

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_SPOTIFY_CLIENT_ID=$VITE_SPOTIFY_CLIENT_ID

# Echouer ici plutot que de livrer un bundle muet. Sans ces valeurs l'appli se
# charge, affiche l'ecran de connexion, et echoue a chaque requete sans dire
# pourquoi — un symptome bien plus couteux a diagnostiquer qu'un build rouge.
RUN test -n "$VITE_SUPABASE_URL" || { echo "ERREUR : VITE_SUPABASE_URL absente. Dans Coolify, ajoutez-la en variable d'environnement AVEC l'option « Build Variable » cochee."; exit 1; }
RUN test -n "$VITE_SUPABASE_ANON_KEY" || { echo "ERREUR : VITE_SUPABASE_ANON_KEY absente (option « Build Variable » a cocher)."; exit 1; }

RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
