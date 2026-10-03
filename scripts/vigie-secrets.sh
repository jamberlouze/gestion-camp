#!/bin/bash
# Secrets de la Vigie des camps compétiteurs (fonction Edge Supabase `vigie`).
# Demande chaque valeur sans l'afficher, puis l'enregistre dans Supabase.
# Laisser vide = ne pas changer ce secret. À lancer depuis le dossier gestion-camp.
set -euo pipefail
cd "$(dirname "$0")/.."

fichier=$(mktemp)
trap 'rm -f "$fichier"' EXIT

demander() {
  local nom=$1 aide=$2 valeur
  printf '%s (%s) : ' "$nom" "$aide"
  read -rs valeur
  echo
  [ -n "$valeur" ] && printf '%s=%s\n' "$nom" "$valeur" >> "$fichier"
  return 0
}

demander ANTHROPIC_API_KEY "clé API Claude, commence par sk-ant-"
demander GMAIL_CLIENT_ID "mêmes valeurs que la Vigie de subventions"
demander GMAIL_CLIENT_SECRET "idem"
demander GMAIL_REFRESH_TOKEN "idem"
demander GMAIL_EXPEDITEUR "adresse qui envoie, ex. maxime@camptremblant.com"

if [ ! -s "$fichier" ]; then
  echo "Rien à enregistrer."
  exit 0
fi
npx supabase secrets set --env-file "$fichier"
echo "Secrets enregistrés. Vérifier dans l'app : Vigie des camps → Réglages → Connexions."
