import { EnConstruction } from '@/shell/EnConstruction'
import { MODULES } from '@/shell/modules'

export default function ModuleEmbarcations() {
  return (
    <EnConstruction
      module={MODULES.find((m) => m.id === 'embarcations')!}
      message="Migration prévue début octobre. D'ici là, l'ancienne application de suivi reste en service."
    />
  )
}
