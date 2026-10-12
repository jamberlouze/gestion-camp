import { useState, type FormEvent } from 'react'
import { BoutonSupprimer } from '@/lib/BoutonsAction'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { ui } from '@/lib/ui'
import { IconeCorbeille } from '@/lib/icones'
import { useCreerArticle, useMajArticle, useSupprimerArticle, useSupprimerCompte, type Donnees } from './donnees'
import { dateCourte, nomArticle, total } from './outils'
import type { Article } from './types'

interface Defauts {
  section_id: string | null
  lieu_id: string | null
  entreprise_id: string | null
}

/**
 * Fiche d'un article : nom, type, section, lieu, compagnie, nombre
 * nécessaire, note, et l'historique de ses comptes. `id` null = nouvel
 * article. Marche sans réseau (file de l'inventaire).
 */
export function Fiche({
  d,
  id,
  ecriture,
  sectionObligatoire,
  defauts,
  fermer,
  compter,
}: {
  d: Donnees
  id: string | null
  ecriture: boolean
  /** Pas de « sans section » (Embarcations : les droits suivent la section). */
  sectionObligatoire?: boolean
  defauts: Defauts
  fermer: () => void
  /** Ouvre le compte de cet article (quelqu'un qui écrit). */
  compter?: (id: string) => void
}) {
  const article = id ? d.article.get(id) : undefined
  const creer = useCreerArticle()
  const maj = useMajArticle()
  const supprimer = useSupprimerArticle()
  const supprimerCompte = useSupprimerCompte()
  const [nom, setNom] = useState(article?.nom ?? '')
  const [variante, setVariante] = useState(article?.variante ?? '')
  const [section, setSection] = useState(article ? (article.section_id ?? '') : (defauts.section_id ?? (sectionObligatoire ? (d.sections[0]?.id ?? '') : '')))
  const [lieu, setLieu] = useState(article ? (article.lieu_id ?? '') : (defauts.lieu_id ?? ''))
  const [compagnie, setCompagnie] = useState(article ? (article.entreprise_id ?? '') : (defauts.entreprise_id ?? ''))
  const [necessaire, setNecessaire] = useState(article?.necessaire == null ? '' : String(article.necessaire))
  const [note, setNote] = useState(article?.note ?? '')

  if (id && !article) return null
  const historique = article ? d.historique(article.id) : []
  const jamaisCompte = historique.length === 0

  function soumettre(e: FormEvent) {
    e.preventDefault()
    const champs = {
      nom: nom.trim(),
      variante: variante.trim() || null,
      section_id: section || null,
      lieu_id: lieu || null,
      entreprise_id: compagnie || null,
      necessaire: necessaire === '' ? null : Math.max(0, Math.floor(Number(necessaire))),
      note: note.trim() || null,
    }
    if (!champs.nom) return
    if (article) maj.mutate({ id: article.id, champs })
    else {
      // À la fin de sa section.
      const ordre = Math.max(0, ...d.articles.filter((a) => a.section_id === champs.section_id).map((a) => a.ordre)) + 1
      creer.mutate({ id: crypto.randomUUID(), ...champs, ordre })
    }
    fermer()
  }

  async function retirer(a: Article) {
    if (jamaisCompte) {
      if (await confirmer({ titre: `Supprimer « ${nomArticle(a)} » ?`, message: 'Il n’a jamais été compté : il disparaît pour de bon.', libelleOk: 'Supprimer', danger: true })) {
        supprimer.mutate(a.id)
        fermer()
      }
    } else if (
      await confirmer({
        titre: `Retirer « ${nomArticle(a)} » de l'inventaire ?`,
        message: 'Il ne sera plus à compter. Son historique est gardé ; on peut le remettre.',
        libelleOk: 'Retirer',
      })
    ) {
      maj.mutate({ id: a.id, champs: { actif: false } })
      fermer()
    }
  }

  const lecture = !ecriture
  const titre = article ? nomArticle(article) : 'Nouvel article'

  return (
    <Dialogue titre={titre} fermer={fermer}>
      <form onSubmit={soumettre} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 sm:col-span-1">
            <label className={ui.etiquette} htmlFor="art-nom">
              Nom
            </label>
            <input id="art-nom" required disabled={lecture} className={ui.champ} value={nom} onChange={(e) => setNom(e.target.value)} autoFocus={!article} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={ui.etiquette} htmlFor="art-variante">
              Type (taille, sorte…)
            </label>
            <input id="art-variante" disabled={lecture} className={ui.champ} value={variante} placeholder="—" onChange={(e) => setVariante(e.target.value)} />
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="art-section">
              Section
            </label>
            <select id="art-section" required={sectionObligatoire} disabled={lecture} className={ui.champ} value={section} onChange={(e) => setSection(e.target.value)}>
              {!sectionObligatoire && <option value="">—</option>}
              {d.sections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="art-lieu">
              Lieu
            </label>
            <select id="art-lieu" disabled={lecture} className={ui.champ} value={lieu} onChange={(e) => setLieu(e.target.value)}>
              <option value="">—</option>
              {d.lieux.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="art-compagnie">
              Compagnie
            </label>
            <select id="art-compagnie" disabled={lecture} className={ui.champ} value={compagnie} onChange={(e) => setCompagnie(e.target.value)}>
              <option value="">—</option>
              {d.compagnies
                .filter((c) => c.actif || c.id === compagnie)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className={ui.etiquette} htmlFor="art-necessaire">
              Nombre nécessaire
            </label>
            <input
              id="art-necessaire"
              inputMode="numeric"
              disabled={lecture}
              className={ui.champ}
              value={necessaire}
              placeholder="—"
              onChange={(e) => setNecessaire(e.target.value.replace(/[^\d]/g, ''))}
            />
          </div>
        </div>
        <div>
          <label className={ui.etiquette} htmlFor="art-note">
            Note (où exactement, quoi savoir…)
          </label>
          <textarea id="art-note" rows={2} disabled={lecture} className={ui.champ} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {article && (
          <section>
            <h3 className={ui.etiquette}>Comptes</h3>
            {historique.length ? (
              <ul className="divide-y divide-pierre-100 rounded-lg border border-pierre-200 text-sm">
                {historique.map((c, i) => (
                  <li key={c.jour} className="flex items-start gap-2 px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <span className={`mr-3 inline-block w-28 ${i === 0 ? 'font-semibold' : 'text-pierre-600'}`}>{dateCourte(c.jour)}</span>
                      <span className="tabular-nums">
                        {c.bon} bons{c.brise ? `, ${c.brise} brisés` : ''}
                        {c.incomplet ? `, ${c.incomplet} incomplets` : ''} · total {total(c)}
                      </span>
                      {(c.note || c.compte_par_nom) && (
                        <p className="text-xs text-pierre-500">{[c.note, c.compte_par_nom && `par ${c.compte_par_nom}`].filter(Boolean).join(' — ')}</p>
                      )}
                    </div>
                    {ecriture && (
                      <button
                        type="button"
                        className="rounded p-1 text-pierre-400 hover:bg-red-50 hover:text-red-700"
                        aria-label={`Supprimer le compte du ${dateCourte(c.jour)}`}
                        onClick={async () => {
                          if (await confirmer({ titre: `Supprimer le compte du ${dateCourte(c.jour)} ?`, libelleOk: 'Supprimer', danger: true }))
                            supprimerCompte.mutate({ article_id: c.article_id, jour: c.jour })
                        }}
                      >
                        <IconeCorbeille className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-pierre-500">Jamais compté.</p>
            )}
          </section>
        )}

        {article && !article.actif && <p className="text-sm text-amber-800">Retiré de l'inventaire : il n'est plus à compter.</p>}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {ecriture && article && article.actif && <BoutonSupprimer onClick={() => retirer(article)}>{jamaisCompte ? 'Supprimer' : 'Retirer'}</BoutonSupprimer>}
          {ecriture && article && !article.actif && (
            <button
              type="button"
              className={ui.boutonSecondaire}
              onClick={() => {
                maj.mutate({ id: article.id, champs: { actif: true } })
                fermer()
              }}
            >
              Remettre dans l'inventaire
            </button>
          )}
          <div className="ml-auto flex gap-2">
            {compter && article?.actif && (
              <button type="button" className={ui.boutonSecondaire} onClick={() => compter(article.id)}>
                Compter
              </button>
            )}
            <button type="button" className={ui.boutonSecondaire} onClick={fermer}>
              {ecriture ? 'Annuler' : 'Fermer'}
            </button>
            {ecriture && <button className={ui.bouton}>{article ? 'Enregistrer' : 'Ajouter'}</button>}
          </div>
        </div>
      </form>
    </Dialogue>
  )
}
