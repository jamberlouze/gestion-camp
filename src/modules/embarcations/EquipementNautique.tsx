import { BandeauErreurs } from '@/lib/BandeauErreurs'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { useDonneesDe, useTempsReel } from '@/modules/inventaire/donnees'
import { Equipement } from '@/modules/inventaire/Equipement'

/**
 * Onglet Équipement : VFI, rames et pagaies (choix de Maxime du 2026-10-11),
 * comptés comme le reste de l'inventaire (2026-10-12 : « uniformiser ») —
 * mêmes écrans, comptes datés par section, hors ligne. Ce sont les sections
 * de l'inventaire dont le module est Embarcations : les droits sont ceux
 * d'Embarcations.
 */
export function EquipementNautique() {
  useTempsReel()
  const d = useDonneesDe('embarcations')
  const ecriture = useAuth().peutEcrire('embarcations')
  return (
    <div>
      <BandeauErreurs racine="inventaire" />
      {d.erreur && !d.pret ? (
        <p className={ui.erreur}>{messageErreur(d.erreur)}</p>
      ) : !d.pret ? (
        <p className="py-8 text-center text-sm text-pierre-500">Chargement de l'équipement…</p>
      ) : (
        <Equipement d={d} ecriture={ecriture} sectionObligatoire />
      )}
    </div>
  )
}
