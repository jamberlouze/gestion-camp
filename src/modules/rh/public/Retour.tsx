import { useEffect, useState } from 'react'
import { urlEmplois } from '@/lib/pagesPubliques'
import { Cases, Choix, Entete, Page, Question } from '@/lib/public/habillage'
import { ui } from '@/lib/ui'
import { erreursRetour, nettoyerRetour, postesPourSaisons, RETOUR_VIDE, TEXTES_RETOUR as t, type PageRetour, type ReponsesRetour } from '../retour'
import { TexteFormate } from '../TexteFormate'
import { envoyer, lire } from './api'
import { Message, PiedEmplois } from './commun'

// Intention de retour (/retour/<jeton>) : la personne est identifiée par son
// lien personnel (fini le rattachement par courriel). « Oui » devient une
// candidature « Intention de retour » ; « Non », une candidature « Ne
// revient pas ». Réponse modifiable tant que la direction ne l'a pas traitée.

const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Montreal' }).format(new Date(iso))

export default function Retour({ jeton }: { jeton: string }) {
  const [page, setPage] = useState<PageRetour | null | 'introuvable' | 'erreur'>(null)
  const [rep, setRep] = useState<ReponsesRetour>(RETOUR_VIDE)
  const [edition, setEdition] = useState(true)
  const [tente, setTente] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [fini, setFini] = useState<'oui' | 'non' | null>(null)

  useEffect(() => {
    document.title = t.titre
    document.documentElement.lang = 'fr'
    lire<PageRetour>(`/api/rh/retour?jeton=${encodeURIComponent(jeton)}`).then((r) => {
      if (!r.ok) return setPage(r.statut === 404 ? 'introuvable' : 'erreur')
      const p = r.donnees
      setPage(p)
      setEdition(!p.reponse)
      setRep(
        p.precedent && p.reponse
          ? {
              reponse: p.reponse,
              saison_ids: p.precedent.saison_ids,
              poste_ids: p.precedent.poste_ids,
              date_debut: p.precedent.date_debut ?? '',
              empechements: p.precedent.empechements ?? '',
              autre: p.precedent.autre ?? '',
            }
          : { ...RETOUR_VIDE, saison_ids: [p.saison.id] },
      )
    })
  }, [jeton])

  if (page === null) return <Message titre="…" />
  if (page === 'introuvable') return <Message titre={t.titre}>{t.introuvable}</Message>
  if (page === 'erreur') return <Message titre={t.titre}>{t.erreur_envoi}</Message>

  const entete = <Entete surtitre={page.saison.nom} titre={t.titre} logo="/logos/logo-gbpa.png" nomLogo="Base de plein air Mont-Tremblant" />
  if (fini) {
    return (
      <Page>
        {entete}
        <div className={`${ui.carte} space-y-2 p-6 text-center text-pierre-700`}>{fini === 'oui' ? t.merci_oui : t.merci_non}</div>
        <PiedEmplois />
      </Page>
    )
  }

  const err = tente ? erreursRetour(rep, page) : {}
  const changer = <K extends keyof ReponsesRetour>(cle: K, valeur: ReponsesRetour[K]) => setRep((r) => ({ ...r, [cle]: valeur }))
  const postes = postesPourSaisons(page, rep.saison_ids)
  const nomCompagnie = new Map(page.compagnies.map((c) => [c.id, c.nom]))
  const intro = page.intro?.texte ? (
    <div className={`${ui.carte} p-5`}>
      <TexteFormate texte={page.intro.texte} valeurs={{ prenom: page.surnom ?? page.prenom, saison: page.saison.nom, lien_emplois: urlEmplois('/emplois') }} />
    </div>
  ) : null

  const repondre = async () => {
    setTente(true)
    setMessage(null)
    if (Object.keys(erreursRetour(rep, page)).length) {
      setMessage(t.a_corriger)
      return
    }
    setEnvoi(true)
    const r = await envoyer('/api/rh/retour', { jeton, reponses: nettoyerRetour(rep) })
    setEnvoi(false)
    if (r.statut === 200) {
      setFini(rep.reponse === 'oui' ? 'oui' : 'non')
      window.scrollTo(0, 0)
    } else setMessage(r.statut === 409 ? t.deja_traitee : r.statut === 404 ? t.introuvable : t.erreur_envoi)
  }

  if (!edition && page.reponse) {
    return (
      <Page>
        {entete}
        <div className={`${ui.carte} space-y-3 p-5 text-sm text-pierre-700`}>
          <p>{t.deja_repondu.replace('{reponse}', page.reponse === 'oui' ? t.oui : t.non).replace('{date}', page.repondu_le ? dateLongue(page.repondu_le) : '')}</p>
          {page.modifiable ? (
            <button className={ui.boutonSecondaire} onClick={() => setEdition(true)}>
              {t.modifier}
            </button>
          ) : (
            <p className="text-pierre-500">{t.deja_traitee}</p>
          )}
        </div>
        <PiedEmplois />
      </Page>
    )
  }

  return (
    <Page>
      {entete}
      {intro}
      <form
        noValidate
        className={`${ui.carte} space-y-5 p-5`}
        onSubmit={(e) => {
          e.preventDefault()
          void repondre()
        }}
      >
        <Question libelle={t.revenir} requis erreur={err.reponse}>
          <Choix
            nom="reponse"
            valeur={rep.reponse}
            changer={(x) => changer('reponse', x)}
            options={[
              { valeur: 'oui', libelle: t.oui },
              { valeur: 'non', libelle: t.non },
            ]}
          />
        </Question>
        {rep.reponse === 'oui' && (
          <>
            <Question libelle={t.saisons} aide={t.plusieurs} requis erreur={err.saison_ids}>
              <Cases
                options={page.saisons.map((s) => ({ valeur: s.id, libelle: s.nom }))}
                valeur={rep.saison_ids}
                changer={(ids) => {
                  // Les postes qui ne sont plus offerts pour ces saisons tombent.
                  const offerts = new Set(postesPourSaisons(page, ids).map((p) => p.id))
                  setRep((r) => ({ ...r, saison_ids: ids, poste_ids: r.poste_ids.filter((id) => offerts.has(id)) }))
                }}
              />
            </Question>
            <Question libelle={t.postes} aide={t.plusieurs} requis erreur={err.poste_ids}>
              <div className="space-y-3">
                {[...new Set(postes.map((p) => p.compagnie))].map((cid) => (
                  <div key={cid}>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-pierre-500">{nomCompagnie.get(cid)}</p>
                    <Cases
                      options={postes.filter((p) => p.compagnie === cid).map((p) => ({ valeur: p.id, libelle: p.nom }))}
                      valeur={rep.poste_ids}
                      changer={(ids) => changer('poste_ids', ids)}
                    />
                  </div>
                ))}
              </div>
            </Question>
            <Question libelle={t.date_debut} requis erreur={err.date_debut}>
              <input type="date" className={`${ui.champ} ${err.date_debut ? 'border-red-400' : ''}`} value={rep.date_debut} onChange={(e) => changer('date_debut', e.target.value)} />
            </Question>
            <Question libelle={t.empechements}>
              <textarea rows={2} className={ui.champ} value={rep.empechements} onChange={(e) => changer('empechements', e.target.value)} />
            </Question>
          </>
        )}
        <Question libelle={t.autre}>
          <textarea rows={3} className={ui.champ} value={rep.autre} onChange={(e) => changer('autre', e.target.value)} />
        </Question>
        {message && <p className={ui.erreur}>{message}</p>}
        <button className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi}>
          {envoi ? t.envoi : t.envoyer}
        </button>
      </form>
      <PiedEmplois />
    </Page>
  )
}
