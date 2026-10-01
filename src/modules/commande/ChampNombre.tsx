import { useState, type ComponentProps } from 'react'
import { ChampTexte } from '@/lib/ChampTexte'

/**
 * Nombre enregistré à la sortie du champ. `enregistrer` renvoie la valeur
 * retenue (ex. végé ramené aux portions) : le champ l'affiche, même quand
 * elle ne change pas la valeur déjà enregistrée (ChampTexte ne se resynchronise
 * que si la valeur enregistrée change).
 */
export function ChampNombre({
  valeur,
  enregistrer,
  ...props
}: { valeur: number; enregistrer: (v: string) => number } & Omit<
  ComponentProps<typeof ChampTexte>,
  'valeur' | 'enregistrer' | 'type' | 'obligatoire'
>) {
  const [version, setVersion] = useState(0)
  return (
    <ChampTexte
      key={version}
      min={0}
      {...props}
      type="number"
      obligatoire
      valeur={String(valeur)}
      enregistrer={(v) => {
        if (String(enregistrer(v)) !== v) setVersion((n) => n + 1)
      }}
    />
  )
}
