import { useState } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { IconeCorbeille } from '@/lib/icones'
import { ui } from '@/lib/ui'
import { useRh } from './contexte'
import { ouvrirFichier, SEAU_DOCUMENTS, useAjouterDocument, useDocuments, useModifierDocument, useRetirerDocument } from './donnees'
import { dateCourte, horodatage, tailleFichier } from './outils'
import { GENRES_DOCUMENT, type Document, type GenreDocument } from './types'
import { champPetit } from './styles'

const ACCEPTE = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx'

/**
 * Documents d'une personne (seau privé). `genres` : seulement ces genres
 * (ex. le CV dans la fiche d'une candidature). `candidatureId` : un fichier
 * ajouté ici y est rattaché.
 */
export function ListeDocuments({ personneId, genres, candidatureId, genreParDefaut = 'autre' }: { personneId: string; genres?: GenreDocument[]; candidatureId?: string; genreParDefaut?: GenreDocument }) {
  const { ecriture, auj } = useRh()
  const documents = useDocuments(personneId)
  const ajouter = useAjouterDocument(personneId)
  const retirer = useRetirerDocument(personneId)
  const modifier = useModifierDocument(personneId)
  const [genre, setGenre] = useState<GenreDocument>(genreParDefaut)
  const [erreur, setErreur] = useState<string | null>(null)

  const liste = (documents.data ?? []).filter((d) => !genres || genres.includes(d.genre))
  const ordre = (g: GenreDocument) => GENRES_DOCUMENT.findIndex((x) => x.id === g)
  liste.sort((a, b) => ordre(a.genre) - ordre(b.genre) || b.created_at.localeCompare(a.created_at))

  const ouvrir = (d: Document) => ouvrirFichier(SEAU_DOCUMENTS, d.chemin).catch((e) => setErreur(messageErreur(e)))

  return (
    <div className="space-y-2 text-sm">
      {documents.isLoading && <p className="text-pierre-500">Chargement…</p>}
      {!documents.isLoading && liste.length === 0 && <p className="text-pierre-500">Aucun document.</p>}
      <ul className="divide-y divide-pierre-100">
        {liste.map((d) => {
          const g = GENRES_DOCUMENT.find((x) => x.id === d.genre)!
          const expire = d.expire_le && d.expire_le < auj
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
              <button className="min-w-0 flex-1 truncate text-left text-foret-800 hover:underline" title={d.nom ?? undefined} onClick={() => ouvrir(d)}>
                📄 {d.nom ?? g.nom}
              </button>
              {!genres && <span className="text-xs text-pierre-500">{g.nom}</span>}
              {g.expire &&
                (ecriture ? (
                  <label className={`flex items-center gap-1 text-xs ${expire ? 'text-red-700' : 'text-pierre-500'}`}>
                    Expire le
                    <input
                      type="date"
                      className="rounded border border-pierre-200 px-1 py-0.5 text-xs"
                      defaultValue={d.expire_le ?? ''}
                      onBlur={(e) => e.target.value !== (d.expire_le ?? '') && modifier.mutate({ id: d.id, champs: { expire_le: e.target.value || null } })}
                    />
                  </label>
                ) : (
                  d.expire_le && <span className={`text-xs ${expire ? 'text-red-700' : 'text-pierre-500'}`}>expire le {dateCourte(d.expire_le)}</span>
                ))}
              <span className="text-xs text-pierre-400" title={d.ajoute_par_nom ? `Ajouté par ${d.ajoute_par_nom}` : undefined}>
                {tailleFichier(d.taille)} · {horodatage(d.created_at)}
              </span>
              {ecriture && (
                <button
                  className="text-pierre-400 hover:text-red-700"
                  title="Retirer"
                  onClick={async () => {
                    if (await confirmer({ titre: `Retirer « ${d.nom ?? g.nom} » ?`, message: 'Le fichier sera effacé.', libelleOk: 'Retirer', danger: true }))
                      retirer.mutate(d, { onError: (e) => setErreur(messageErreur(e)) })
                  }}
                >
                  <IconeCorbeille className="h-4 w-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {ecriture && (
        <div className="flex flex-wrap items-center gap-2">
          {(!genres || genres.length > 1) && (
            <select className={champPetit} value={genre} onChange={(e) => setGenre(e.target.value as GenreDocument)}>
              {GENRES_DOCUMENT.filter((g) => !genres || genres.includes(g.id)).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nom}
                </option>
              ))}
            </select>
          )}
          <label className={`${ui.boutonSecondaire} cursor-pointer py-1.5`}>
            {ajouter.isPending ? 'Envoi…' : '📎 Ajouter un fichier'}
            <input
              type="file"
              className="hidden"
              accept={ACCEPTE}
              multiple
              disabled={ajouter.isPending}
              onChange={(e) => {
                const fichiers = [...(e.target.files ?? [])]
                e.target.value = ''
                setErreur(null)
                for (const fichier of fichiers) {
                  if (fichier.size > 20 * 1024 * 1024) {
                    setErreur(`« ${fichier.name} » dépasse 20 Mo.`)
                    continue
                  }
                  ajouter.mutate(
                    { fichier, genre: genres?.length === 1 ? genres[0] : genre, candidature_id: candidatureId ?? null },
                    { onError: (er) => setErreur(messageErreur(er)) },
                  )
                }
              }}
            />
          </label>
        </div>
      )}
      {erreur && <p className={ui.erreur}>{erreur}</p>}
    </div>
  )
}
