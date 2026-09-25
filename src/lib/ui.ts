// Classes Tailwind partagées, pour garder une apparence uniforme entre modules.
export const ui = {
  bouton:
    'inline-flex items-center justify-center gap-1.5 rounded-lg bg-foret-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-foret-800 disabled:opacity-50',
  boutonSecondaire:
    'inline-flex items-center justify-center gap-1.5 rounded-lg border border-pierre-300 bg-white px-3.5 py-2 text-sm font-medium text-pierre-800 hover:bg-pierre-50 disabled:opacity-50',
  boutonDanger:
    'inline-flex items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50',
  champ:
    'w-full rounded-lg border border-pierre-300 bg-white px-3 py-2 text-sm text-pierre-900 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20',
  etiquette: 'mb-1 block text-xs font-medium uppercase tracking-wide text-pierre-500',
  carte: 'rounded-xl border border-pierre-200 bg-white shadow-sm',
  erreur: 'rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800',
}
