import { useState } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { urlPublique } from '@/lib/pagesPubliques'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { useFiches, useNouveauLien, useSupprimerFiche, useTotauxFiches } from './donnees'
import { DIETES, type Diete, type Reservation } from './types'

/**
 * Page client sans compte (/client/<jeton>) et fiches participants
 * (/fiches/<jeton>) : liens à transmettre, totaux des fiches ; le détail
 * des fiches seulement avec l'accès « Fiches participants ».
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
    <Section titre="Page client">
      <div className="space-y-4 text-sm">
        <Lien
          libelle="Lien de la page client"
          aide="Le client y voit son séjour, accepte l'estimé, signe le contrat, télécharge ses documents et vous écrit. Sans compte ni mot de passe."
          url={urlPublique(`/client/${r.jeton_client}`)}
          refaire={ecriture ? () => refaire('client') : undefined}
        />
        {scolaire && (
          <div className="border-t border-pierre-100 pt-4">
            <Lien
              libelle="Fiches participants (à transmettre aux parents)"
              aide="Une fiche par élève et par adulte : allergies, Epipen, diète, médicaments. Effacées 3 mois après le séjour (Loi 25)."
              url={urlPublique(`/fiches/${r.jeton_fiches}`)}
              refaire={ecriture ? () => refaire('fiches') : undefined}
            />
            <Fiches r={r} />
          </div>
        )}
      </div>
    </Section>
  )
}

function Lien({ libelle, aide, url, refaire }: { libelle: string; aide: string; url: string; refaire?: () => void }) {
  const [copie, setCopie] = useState(false)
  return (
    <div className="space-y-1.5">
      <p className="font-medium">{libelle}</p>
      <div className="flex flex-wrap gap-2">
        <input readOnly className={`${ui.champ} min-w-0 flex-1 text-xs`} value={url} onFocus={(e) => e.currentTarget.select()} />
        <button
          className={ui.boutonSecondaire}
          onClick={async () => {
            await navigator.clipboard.writeText(url)
            setCopie(true)
            setTimeout(() => setCopie(false), 2000)
          }}
        >
          {copie ? 'Copié ✓' : 'Copier'}
        </button>
        <a className={ui.boutonSecondaire} href={url} target="_blank" rel="noreferrer">
          Ouvrir
        </a>
      </div>
      <p className="text-xs text-pierre-500">
        {aide}
        {refaire && (
          <>
            {' '}
            <button className="underline hover:text-pierre-800" onClick={refaire}>
              Nouveau lien
            </button>
          </>
        )}
      </p>
    </div>
  )
}

function Fiches({ r }: { r: Reservation }) {
  const { peutLire, peutEcrire } = useAuth()
  const voit = peutLire('reservations_sante')
  const totaux = useTotauxFiches(r.id)
  const fiches = useFiches(r.id, voit)
  const supprimer = useSupprimerFiche()
  const [ouvert, setOuvert] = useState(false)
  const t = totaux.data
  const attendues = (r.nb_participants ?? 0) + (r.nb_accompagnateurs ?? 0)

  return (
    <div className="mt-3 space-y-2">
      <p>
        <span className="font-medium tabular-nums">{t?.recues ?? 0}</span> fiche(s) reçue(s) sur {attendues} attendue(s)
        {t && t.recues > 0 && (
          <span className="text-pierre-500">
            {' '}
            ({t.participants} élève(s), {t.adultes} adulte(s))
          </span>
        )}
      </p>
      {t && t.recues > 0 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          {Object.entries(t.dietes).map(([d, n]) => (
            <span key={d} className="rounded-full bg-foret-50 px-2 py-0.5 text-foret-800">
              {DIETES[d as Diete]} : {n}
            </span>
          ))}
          {t.sante > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">Allergies ou santé : {t.sante}</span>}
          {t.epipen > 0 && <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-800">Epipen : {t.epipen}</span>}
          {t.sans_medicaments > 0 && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-pierre-700">Sans autorisation de médicaments : {t.sans_medicaments}</span>}
          {t.effacees > 0 && <span className="rounded-full bg-pierre-100 px-2 py-0.5 text-pierre-500">Effacées (Loi 25) : {t.effacees}</span>}
        </div>
      )}
      {voit && t && t.recues > 0 && (
        <button className="text-xs text-foret-700 underline" onClick={() => setOuvert(!ouvert)}>
          {ouvert ? 'Cacher les fiches' : 'Voir les fiches'}
        </button>
      )}
      {voit && ouvert && (
        <div className="overflow-x-auto rounded-lg border border-pierre-200">
          <table className="w-full text-xs">
            <thead className="border-b border-pierre-200 bg-pierre-50 text-left uppercase tracking-wide text-pierre-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">Nom</th>
                <th className="px-2 py-1.5 font-medium">Groupe</th>
                <th className="px-2 py-1.5 font-medium">Santé</th>
                <th className="px-2 py-1.5 font-medium">Diète</th>
                <th className="px-2 py-1.5 font-medium">Médic.</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-pierre-100">
              {(fiches.data ?? []).map((f) => (
                <tr key={f.id} className="align-top">
                  <td className="px-2 py-1.5">
                    {f.effacee_le ? (
                      <span className="text-pierre-400">Effacée</span>
                    ) : (
                      <>
                        {f.nom}, {f.prenom}
                        {f.genre === 'adulte' && <span className="ml-1 text-pierre-400">(adulte)</span>}
                        {f.matricule && <div className="text-pierre-400">{f.matricule}</div>}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-1.5">{f.groupe}</td>
                  <td className="px-2 py-1.5">
                    {f.sante ? (
                      <div className="space-y-0.5">
                        {f.allergies && <div>Allergies : {f.allergies}</div>}
                        {f.problemes_sante && <div>Santé : {f.problemes_sante}</div>}
                        {f.epipen && <div className="font-medium text-red-700">Epipen</div>}
                      </div>
                    ) : f.sante === false ? (
                      <span className="text-pierre-400">Rien</span>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">{f.diete && (f.diete === 'autre' ? f.diete_autre : DIETES[f.diete])}</td>
                  <td className="px-2 py-1.5">{f.medicaments === null ? '' : f.medicaments ? 'Oui' : <span className="font-medium text-amber-800">Non</span>}</td>
                  <td className="px-2 py-1.5 text-right">
                    {peutEcrire('reservations_sante') && (
                      <BoutonSupprimer
                        onClick={async () => {
                          const ok = await confirmer({ titre: 'Supprimer cette fiche ?', message: 'Pour une fiche en double ou remplie par erreur.', libelleOk: 'Supprimer', danger: true })
                          if (ok) supprimer.mutate(f.id)
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
