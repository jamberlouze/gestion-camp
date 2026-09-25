import { EnConstruction } from '@/shell/EnConstruction'
import { MODULES } from '@/shell/modules'

export default function ModuleCommande() {
  return (
    <EnConstruction
      module={MODULES.find((m) => m.id === 'commande')!}
      message="Migration prévue après Embarcations. D'ici là, l'ancien calculateur de commande reste en service."
    />
  )
}
