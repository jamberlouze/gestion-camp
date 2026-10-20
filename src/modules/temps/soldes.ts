// Soldes des banques d'heures à ce jour, une ligne par personne qui a ou peut
// avoir une banque : onglet Banques et avertissement « sous 20 h » de
// l'accueil des admins. La base ne renvoie que ce qu'on peut voir (admin :
// tout ; direction : les employés).
import { useMemo } from 'react'
import { alerteBanque, etatBanqueHeures, type Mouvement } from './banques'
import { banqueDe, nomDe, useBanquesTous, useMembres, type Titulaire } from './donnees'
import { nomEmploye, useEmployesFeuille, useFeuillesPropres } from './donneesEmployes'
import { aujourdhui } from './periodes'

export type GroupeBanque = 'direction' | 'compte' | 'sans-compte'

export interface SoldeBanque {
  cle: string
  titulaire: Titulaire
  nom: string
  detail: string
  groupe: GroupeBanque
  actif: boolean
  mouvements: Mouvement[]
  /** Solde à ce jour. */
  heures: number
  etat: { active: boolean; depuis: string | null }
  /** Descendue sous 20 h (ou négative) : avertissement aux admins (alerteBanque). */
  alerte: boolean
}

/**
 * `avecDirection` : la direction aussi (un admin seulement ; la base ne la
 * donne qu'à lui). Les admins n'ont ni feuille ni banque (2026-10-20).
 */
export function useSoldesBanques(avecDirection: boolean) {
  const au = aujourdhui()
  const donnees = useBanquesTous(au)
  const membres = useMembres()
  const employes = useEmployesFeuille()
  const propres = useFeuillesPropres()

  const data = useMemo(() => {
    if (!donnees.data || !membres.data || !employes.data || !propres.data) return null
    const d = donnees.data
    const calculer = (t: Titulaire) => {
      const { mouvements, etats } = banqueDe(d, t, au)
      const etat = etatBanqueHeures(etats, au)
      return { mouvements, heures: mouvements.at(-1)?.solde ?? 0, etat, alerte: alerteBanque(mouvements, etat.active) }
    }

    const resultat: SoldeBanque[] = []
    if (avecDirection)
      for (const m of membres.data) {
        if (m.role !== 'direction') continue
        const t: Titulaire = { userId: m.id }
        const c = calculer(t)
        if (!m.actif && !c.mouvements.length) continue
        resultat.push({
          cle: `u:${m.id}`,
          titulaire: t,
          nom: nomDe(m),
          detail: 'Direction',
          groupe: 'direction',
          actif: m.actif,
          ...c,
        })
      }
    for (const e of employes.data) {
      const compte = propres.data.has(e.id)
      const t: Titulaire = { employeId: e.id }
      const c = calculer(t)
      // Inactif : seulement s'il lui reste quelque chose en banque.
      if (!e.actif && !c.heures) continue
      resultat.push({
        cle: `e:${e.id}`,
        titulaire: t,
        nom: nomEmploye(e),
        detail: [e.nom_complet ? e.surnom : null, e.poste].filter(Boolean).join(' · '),
        groupe: compte ? 'compte' : 'sans-compte',
        actif: e.actif,
        ...c,
      })
    }
    return resultat.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  }, [donnees.data, membres.data, employes.data, propres.data, avecDirection, au])

  return { data, au, error: donnees.error ?? membres.error ?? employes.error ?? propres.error }
}
