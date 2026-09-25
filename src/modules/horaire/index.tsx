import { EnConstruction } from '@/shell/EnConstruction'
import { MODULES } from '@/shell/modules'

export default function ModuleHoraire() {
  return (
    <EnConstruction
      module={MODULES.find((m) => m.id === 'horaire')!}
      message="Module en développement. Il sera construit directement dans cette application."
    />
  )
}
