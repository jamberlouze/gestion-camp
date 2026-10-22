import { confirmer } from '@/lib/Confirmation'
import { urlPublique } from '@/lib/pagesPubliques'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { useNouveauLien } from './donnees'
import { FichesParticipants } from './FichesParticipants'
import { LienPublic } from './LienPublic'
import type { Reservation } from './types'

/**
 * Page client sans compte (/client/<jeton>) : le lien à transmettre au
 * responsable du groupe ; puis, pour Classe nature et Journée plein air,
 * la section « Fiches participants » (FichesParticipants.tsx), juste après.
 */
export function EspaceClient({ r }: { r: Reservation }) {
  const { ecriture } = useDonnees()
  const nouveauLien = useNouveauLien()
  const scolaire = r.forfait === 'classe_nature' || r.forfait === 'journee_plein_air'

  const refaire = async (genre: 'client' | 'fiches') => {
    const ok = await confirmer({
      titre: genre === 'client' ? 'Nouveau lien de la page client ?' : 'Nouveau lien des fiches ?',
      message: "L'ancien lien ne fonctionnera plus. À faire seulement si le lien a été transmis à la mauvaise personne.",
      libelleOk: 'Nouveau lien',
      danger: false,
    })
    if (ok) nouveauLien.mutate({ reservation: r.id, genre })
  }

  return (
    <>
      <Section titre="Page client">
        <div className="text-sm">
          <LienPublic
            libelle="Lien de la page client"
            aide={`Sans compte ni mot de passe. Le client y voit son séjour et accepte l'estimé ; le contrat à signer une fois l'estimé accepté ; après la signature, la confirmation des informations${scolaire ? ', les fiches participants reçues (allergies et diète)' : ''}, ses documents et ses factures. Pas de message sur la page : les questions arrivent par courriel.`}
            url={urlPublique(`/client/${r.jeton_client}`)}
            refaire={ecriture ? () => refaire('client') : undefined}
          />
        </div>
      </Section>
      {scolaire && <FichesParticipants r={r} refaire={ecriture ? () => refaire('fiches') : undefined} />}
    </>
  )
}
