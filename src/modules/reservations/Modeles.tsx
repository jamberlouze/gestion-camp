import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { ChampTexte } from '@/lib/ChampTexte'
import { confirmer } from '@/lib/Confirmation'
import { messageErreur } from '@/lib/donnees'
import { supabase } from '@/lib/supabase'
import { ui } from '@/lib/ui'
import { Section } from './commun'
import { useDonnees } from './contexte'
import { useModifierCompagnie, useModifierModele } from './donnees'
import { champPetit } from './format'
import { CHAMPS_MODELES } from './pdf/champs'
import { apercuContrat, estimeCourant, ouvrirPdf, pdfDeLaPreArrivee, SEAU } from './productionPdf'
import { QboCompagnie } from './QboCompagnie'
import { FORFAITS, type Compagnie, type Modele } from './types'

/** Modèles des contrats et de la pré-arrivée, coordonnées des compagnies qui facturent. */
export function Modeles() {
  const { modeles, compagniesFacture } = useDonnees()
  const tries = useMemo(
    () => [...modeles].sort((a, b) => a.genre.localeCompare(b.genre) || Object.keys(FORFAITS).indexOf(a.forfait) - Object.keys(FORFAITS).indexOf(b.forfait)),
    [modeles],
  )
  const [choisi, setChoisi] = useState(tries[0]?.id)
  const modele = tries.find((m) => m.id === choisi)
  // Retour de la connexion QuickBooks (le Worker revient ici).
  const [params, setParams] = useSearchParams()
  const retourQbo = params.get('qbo')
  return (
    <div className="space-y-5">
      {retourQbo && (
        <div
          className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
            retourQbo === 'ok' ? 'border-foret-200 bg-foret-50 text-foret-800' : 'border-red-200 bg-red-50 text-red-800'
          }`}
        >
          <span>{retourQbo === 'ok' ? 'QuickBooks est relié. Choisissez maintenant l’article, le code de taxes et les conditions de paiement.' : `Connexion à QuickBooks : ${params.get('message') ?? 'échec.'}`}</span>
          <button className="underline" onClick={() => setParams({}, { replace: true })}>
            Fermer
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-1">
        {tries.map((m) => (
          <button
            key={m.id}
            onClick={() => setChoisi(m.id)}
            className={`rounded-md border px-2.5 py-1 text-sm ${m.id === choisi ? 'border-foret-400 bg-foret-50 font-medium text-foret-800' : 'border-pierre-200 text-pierre-600 hover:border-pierre-400'}`}
          >
            {m.genre === 'contrat' ? 'Contrat' : 'Pré-arrivée'} · {FORFAITS[m.forfait]}
          </button>
        ))}
      </div>
      {modele && <Editeur key={modele.id} modele={modele} />}
      <div className="grid gap-5 xl:grid-cols-2">
        {compagniesFacture.map((c) => (
          <FicheCompagnie key={c.entreprise_id} c={c} />
        ))}
      </div>
    </div>
  )
}

function Editeur({ modele }: { modele: Modele }) {
  const { reservations, sources, ecriture } = useDonnees()
  const modifier = useModifierModele()
  const [titre, setTitre] = useState(modele.titre)
  const [contenu, setContenu] = useState(modele.contenu)
  const [essai, setEssai] = useState('')
  const [erreur, setErreur] = useState<string | null>(null)
  const [occupe, setOccupe] = useState(false)
  const sale = titre !== modele.titre || contenu !== modele.contenu
  // Réservations pour essayer le modèle : même forfait, les plus récentes d'abord.
  const choix = reservations.filter((r) => r.forfait === modele.forfait).sort((a, b) => b.date_arrivee.localeCompare(a.date_arrivee))

  const apercu = async () => {
    const r = choix.find((x) => x.id === essai) ?? choix[0]
    if (!r) return setErreur('Aucune réservation de ce forfait pour faire un essai.')
    setOccupe(true)
    setErreur(null)
    try {
      const e = await estimeCourant(r.id)
      const brouillon = { titre, contenu }
      ouvrirPdf(modele.genre === 'contrat' ? await apercuContrat(sources(r), e, brouillon) : await pdfDeLaPreArrivee(sources(r), e, brouillon))
    } catch (x) {
      setErreur(messageErreur(x))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]">
      <Section
        titre={modele.genre === 'contrat' ? `Contrat · ${FORFAITS[modele.forfait]}` : `Pré-arrivée · ${FORFAITS[modele.forfait]}`}
        action={
          modele.updated_by_nom && (
            <span className="text-xs text-pierre-400">
              Modifié par {modele.updated_by_nom}, {new Date(modele.updated_at).toLocaleDateString('fr-CA')}
            </span>
          )
        }
      >
        <div className="space-y-3">
          <label className="block">
            <span className={ui.etiquette}>Titre (bandeau du document)</span>
            <input className={ui.champ} value={titre} disabled={!ecriture} onChange={(e) => setTitre(e.target.value)} />
          </label>
          <textarea
            className={`${ui.champ} h-[60vh] font-mono text-xs leading-relaxed`}
            value={contenu}
            disabled={!ecriture}
            spellCheck
            onChange={(e) => setContenu(e.target.value)}
          />
          {erreur && <p className={ui.erreur}>{erreur}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {ecriture && (
              <>
                <button
                  className={ui.bouton}
                  disabled={!sale || modifier.isPending}
                  onClick={async () => {
                    const ok = await confirmer({
                      titre: 'Enregistrer le modèle ?',
                      message: 'Les prochains documents le suivront. Les documents déjà produits ne changent pas.',
                      libelleOk: 'Enregistrer',
                      danger: false,
                    })
                    if (ok) modifier.mutate({ id: modele.id, champs: { titre, contenu } })
                  }}
                >
                  {sale ? 'Enregistrer' : 'Enregistré'}
                </button>
                <button
                  className={ui.boutonSecondaire}
                  disabled={!sale}
                  onClick={() => {
                    setTitre(modele.titre)
                    setContenu(modele.contenu)
                  }}
                >
                  Annuler les changements
                </button>
              </>
            )}
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <select aria-label="Réservation d'essai" className={`${champPetit} max-w-64`} value={essai} onChange={(e) => setEssai(e.target.value)}>
                <option value="">{choix[0] ? `Essai : ${choix[0].numero} ${choix[0].nom}` : 'Aucune réservation'}</option>
                {choix.slice(1, 60).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.numero} {r.nom}
                  </option>
                ))}
              </select>
              <button className={ui.boutonSecondaire} disabled={occupe} onClick={apercu}>
                {occupe ? 'Préparation…' : 'Aperçu PDF'}
              </button>
            </span>
          </div>
        </div>
      </Section>
      <Section titre="Aide">
        <div className="space-y-3 text-xs text-pierre-600">
          <ul className="space-y-1">
            <li>
              <code># Titre</code>, <code>## Article</code> (numéroté), <code>### Sous-titre</code>
            </li>
            <li>
              <code>- puce</code>, deux espaces de plus par niveau ; <code>1. élément</code>
            </li>
            <li>
              <code>| a | b |</code> : lignes de tableau (en-tête en <code>**gras**</code>)
            </li>
            <li>
              <code>**gras**</code>, <code>_italique_</code>
            </li>
            <li>
              <code>{'{{#si notes_contrat}}'}</code> … <code>{'{{/si}}'}</code> : seulement si le champ n'est pas vide
            </li>
            <li>
              Blocs : <code>[[entete]]</code> <code>[[paiement]]</code> <code>[[etages]]</code> <code>[[salles]]</code> <code>[[signatures]]</code> <code>[[saut]]</code>
            </li>
          </ul>
          <p className="font-medium text-pierre-800">Champs</p>
          <ul className="space-y-0.5">
            {CHAMPS_MODELES.map(([cle, nom]) => (
              <li key={cle}>
                <code className="text-foret-800">{`{{${cle}}}`}</code> {nom}
              </li>
            ))}
          </ul>
        </div>
      </Section>
    </div>
  )
}

function FicheCompagnie({ c }: { c: Compagnie }) {
  const { ecriture } = useDonnees()
  const modifier = useModifierCompagnie()
  const [erreur, setErreur] = useState<string | null>(null)
  const changer = (champs: Partial<Compagnie>) => modifier.mutate({ id: c.entreprise_id, champs })
  const champ = (cle: keyof Compagnie, libelle: string) => (
    <label className="block">
      <span className={ui.etiquette}>{libelle}</span>
      <ChampTexte className={ui.champ} valeur={String(c[cle] ?? '')} disabled={!ecriture} enregistrer={(v) => changer({ [cle]: v || null } as Partial<Compagnie>)} />
    </label>
  )

  const ajouterAnnexe = async (fichier: File, titre: string) => {
    setErreur(null)
    const ext = fichier.type === 'application/pdf' ? 'pdf' : fichier.type === 'image/png' ? 'png' : 'jpg'
    const chemin = `compagnies/${c.entreprise_id}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from(SEAU).upload(chemin, fichier, { contentType: fichier.type })
    if (error) return setErreur(messageErreur(error))
    changer({ annexes: [...c.annexes, { titre, chemin }] })
  }

  return (
    <Section titre={`${c.nom_court} — sur les documents`}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {champ('raison_sociale', 'Raison sociale')}
          {champ('nom_court', 'Nom court (dans les contrats)')}
          {champ('adresse', 'Adresse')}
          {champ('courriel', 'Courriel')}
          {champ('telephone', 'Téléphone')}
          {champ('signataire', 'Signataire')}
          {champ('tps', 'Numéro de TPS')}
          {champ('tvq', 'Numéro de TVQ')}
          {champ('reponse_interac', 'Réponse Interac')}
        </div>
        <label className="block">
          <span className={ui.etiquette}>Modes de paiement (bloc [[paiement]] du contrat)</span>
          <ZonePaiement valeur={c.consignes_paiement} disabled={!ecriture} enregistrer={(v) => changer({ consignes_paiement: v })} />
        </label>
        <div>
          <span className={ui.etiquette}>Annexes du contrat (dernières pages)</span>
          <ul className="divide-y divide-pierre-100 text-sm">
            {c.annexes.map((a) => (
              <li key={a.chemin} className="flex items-center justify-between py-1.5">
                <span>{a.titre}</span>
                {ecriture && (
                  <button
                    className="text-xs text-red-700 underline"
                    onClick={async () => {
                      const ok = await confirmer({ titre: `Retirer « ${a.titre} » des contrats ?`, libelleOk: 'Retirer' })
                      if (!ok) return
                      changer({ annexes: c.annexes.filter((x) => x.chemin !== a.chemin) })
                      await supabase.storage.from(SEAU).remove([a.chemin])
                    }}
                  >
                    Retirer
                  </button>
                )}
              </li>
            ))}
            {c.annexes.length === 0 && <li className="py-1.5 text-pierre-500">Aucune (ajoutez le spécimen de chèque).</li>}
          </ul>
          {ecriture && <NouvelleAnnexe ajouter={ajouterAnnexe} />}
          <p className="mt-1 text-xs text-pierre-400">Gardées dans un espace privé : jamais publiques, seulement imprimées dans les contrats.</p>
        </div>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <QboCompagnie c={c} />
      </div>
    </Section>
  )
}

function ZonePaiement({ valeur, enregistrer, disabled }: { valeur: string; enregistrer: (v: string) => void; disabled?: boolean }) {
  const [texte, setTexte] = useState(valeur)
  const [base, setBase] = useState(valeur)
  if (valeur !== base) {
    setBase(valeur)
    setTexte(valeur)
  }
  return (
    <textarea
      className={`${ui.champ} h-56 font-mono text-xs`}
      value={texte}
      disabled={disabled}
      onChange={(e) => setTexte(e.target.value)}
      onBlur={() => texte.trim() && texte !== valeur && enregistrer(texte)}
    />
  )
}

function NouvelleAnnexe({ ajouter }: { ajouter: (f: File, titre: string) => Promise<unknown> }) {
  const [titre, setTitre] = useState('Spécimen chèque')
  const [occupe, setOccupe] = useState(false)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <input className={`${champPetit} w-56`} value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre de la page" />
      <label className={`${ui.boutonSecondaire} cursor-pointer`}>
        {occupe ? 'Envoi…' : '+ Fichier (PDF, PNG, JPG)'}
        <input
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="hidden"
          disabled={occupe || !titre.trim()}
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setOccupe(true)
            await ajouter(f, titre.trim())
            setOccupe(false)
          }}
        />
      </label>
    </div>
  )
}
