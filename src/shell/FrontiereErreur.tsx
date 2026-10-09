import { Component, type ReactNode } from 'react'
import { compterRequetesGardees, oublierRequetes } from '@/lib/requetes'
import { ui } from '@/lib/ui'
import { MODULES } from './modules'

// Pages dont les requêtes ne portent ni le nom de l'adresse ni l'id du module.
const AUTRES_PREFIXES: Record<string, string> = { referentiel: 'core' }

// Requêtes du cadre (droits pour le menu, pokes) : en cause quand l'erreur
// vient de plus haut que la page.
const REQUETES_CADRE = ['droits', 'pokes']

type FiltreCle = (cle: readonly unknown[]) => boolean

/**
 * Requêtes propres à la page, d'après le début de l'adresse : 1er élément de
 * la clé = segment de l'adresse, id du module ou préfixe ci-dessus, seul ou
 * suivi d'un tiret (ex. 'cuisine-couts', 'mastertimeline-adresses').
 * null sur l'accueil, qui lit les requêtes de plusieurs modules.
 */
function filtreDeLaPage(chemin: string): FiltreCle | null {
  const segment = chemin.split('/')[1]
  if (!segment) return null
  const prefixes = [segment, MODULES.find((m) => m.chemin === `/${segment}`)?.id, AUTRES_PREFIXES[segment]].filter(
    (p): p is string => !!p,
  )
  return (cle) => {
    const tete = String(cle[0])
    return prefixes.some((p) => tete === p || tete.startsWith(`${p}-`))
  }
}

const filtreDuCadre: FiltreCle = (cle) => REQUETES_CADRE.includes(String(cle[0]))

interface Proprietes {
  /**
   * Adresse de la page (frontière du cadre) : changer de page efface l'erreur.
   * Sans adresse = frontière de toute l'app (main.tsx).
   */
  chemin?: string
  children: ReactNode
}

interface Etat {
  enErreur: boolean
  erreur?: unknown
  chemin?: string
}

/**
 * Une erreur d'affichage ne démonte que ce qui est à l'intérieur (sinon toute
 * l'app devient une page blanche). Autour de chaque page dans le cadre (le menu
 * reste utilisable) et autour de toute l'app en dernier recours (main.tsx).
 */
export class FrontiereErreur extends Component<Proprietes, Etat> {
  state: Etat = { enErreur: false, chemin: this.props.chemin }

  static getDerivedStateFromError(erreur: unknown): Partial<Etat> {
    return { enErreur: true, erreur }
  }

  // Remise à zéro au changement d'adresse, sans remonter une page qui fonctionne
  // (une `key` sur la frontière la remonterait à chaque changement d'onglet).
  static getDerivedStateFromProps(props: Proprietes, etat: Etat): Partial<Etat> | null {
    return props.chemin !== etat.chemin ? { enErreur: false, erreur: undefined, chemin: props.chemin } : null
  }

  render() {
    if (!this.state.enErreur) return this.props.children
    const { chemin } = this.props
    return <EcranErreur erreur={this.state.erreur} filtre={chemin === undefined ? filtreDuCadre : filtreDeLaPage(chemin)} />
  }
}

function EcranErreur({ erreur, filtre }: { erreur: unknown; filtre: FiltreCle | null }) {
  const copie = filtre !== null && compterRequetesGardees(filtre) > 0
  const detail = erreur instanceof Error ? erreur.message : String(erreur)

  return (
    <div className="mx-auto max-w-md px-4 py-8 text-center">
      <p className="text-lg font-medium">Cette page n'a pas pu s'afficher</p>
      <p className="mt-1 text-sm text-pierre-500">
        {copie
          ? "Rechargez la page. Si le problème revient, rechargez sans la copie gardée sur l'appareil : les données de cette page seront relues du serveur."
          : 'Rechargez la page. Si le problème revient, communiquez avec un administrateur.'}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button className={ui.bouton} onClick={() => location.reload()}>
          Recharger
        </button>
        {copie && (
          <button
            className={ui.boutonSecondaire}
            onClick={() => {
              oublierRequetes(filtre)
              location.reload()
            }}
          >
            Recharger sans la copie gardée
          </button>
        )}
      </div>
      <details className="mt-6 text-left text-xs text-pierre-500">
        <summary className="cursor-pointer text-center">Détail technique</summary>
        <p className="mt-2 break-words font-mono">{detail}</p>
      </details>
    </div>
  )
}
