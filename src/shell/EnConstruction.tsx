import { ui } from '@/lib/ui'
import type { DefinitionModule } from './modules'

/** Page temporaire d'un module pas encore porté dans la nouvelle app. */
export function EnConstruction({ module, message }: { module: DefinitionModule; message: string }) {
  return (
    <div className={`${ui.carte} mx-auto max-w-lg p-8 text-center`}>
      <div className="text-4xl">{module.icone}</div>
      <h1 className="mt-3 text-xl font-semibold">{module.nom}</h1>
      <p className="mt-2 text-sm text-pierre-500">{message}</p>
    </div>
  )
}
