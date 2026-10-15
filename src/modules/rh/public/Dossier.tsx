import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Cases, Choix, Entete, fusionnerErreurs, Page, Question } from '@/lib/public/habillage'
import { reduireImage } from '@/lib/photos'
import { ui } from '@/lib/ui'
import { aujourdhui, COURRIEL_EMPLOIS } from '../candidature'
import {
  avecDisponibilites,
  banqueDemandee,
  cvExige,
  depuisPage,
  DIETES_DOSSIER,
  erreursDossier,
  estEte,
  estMineur,
  nasDemande,
  specimenExige,
  TAILLES_DOSSIER,
  type ChampDossier,
  type DonneesDossier,
  type GenreFichierDossier,
  type PageDossier,
} from '../dossierEmbauche'
import { extensionDe } from '../fichiersPublics'
import { TexteFormate } from '../TexteFormate'
import { envoyer, lire, logoDe } from './api'
import { ChampFichier, Message, PiedEmplois } from './commun'
import { SectionConsentement, SectionContrat } from './Signatures'

// Dossier d'embauche (/dossier/<jeton>) : remplace les deux formulaires
// « Confirmation d'embauche » d'Airtable. Une page par embauche, version été
// ou hors été, pré-remplie pour un ancien. Le NAS et le compte au dossier ne
// sont jamais renvoyés au navigateur (3 derniers chiffres seulement). Le
// Worker revérifie tout, dépose les fichiers et enregistre
// (rh.recevoir_dossier) ; on peut renvoyer pour corriger tant que la
// direction n'a pas validé l'embauche. Le contrat et le consentement
// parental se signent sur la même page (Signatures.tsx), à part de l'envoi.

const dateLongue = (iso: string) =>
  new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Montreal' }).format(new Date(iso))

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
/** « 1er au 3 mai », « 28 juin au 5 juillet ». */
function plage(debut: string | null, fin: string | null) {
  if (!debut) return ''
  const j = (n: number) => (n === 1 ? '1er' : String(n))
  const [, m1, j1] = debut.split('-').map(Number)
  if (!fin || fin === debut) return `${j(j1)} ${MOIS[m1 - 1]}`
  const [, m2, j2] = fin.split('-').map(Number)
  if (m1 === m2) return `${j(j1)} ${j2 === j1 + 1 ? 'et' : 'au'} ${j(j2)} ${MOIS[m2 - 1]}`
  return `${j(j1)} ${MOIS[m1 - 1]} au ${j(j2)} ${MOIS[m2 - 1]}`
}

/** Photo de plus de 1,5 Mo réduite (1600 px, JPEG) avant l'envoi ; sinon le fichier tel quel. */
async function alleger(f: File): Promise<File> {
  if (f.size < 1.5 * 1024 * 1024 || !['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(extensionDe(f.name))) return f
  try {
    const b = await reduireImage(f)
    return new File([b], f.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    // Format que le navigateur ne sait pas lire (ex. HEIC hors Safari) : envoyé tel quel.
    return f
  }
}

type Fichiers = Partial<Record<GenreFichierDossier, File | null>>

export default function Dossier({ jeton }: { jeton: string }) {
  const [page, setPage] = useState<PageDossier | null | 'introuvable' | 'erreur'>(null)
  const [d, setD] = useState<DonneesDossier | null>(null)
  const [fichiers, setFichiers] = useState<Fichiers>({})
  const [erreursFichiers, setErreursFichiers] = useState<Partial<Record<GenreFichierDossier, string>>>({})
  const [tente, setTente] = useState(false)
  const [champsServeur, setChampsServeur] = useState<Partial<Record<ChampDossier, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [envoi, setEnvoi] = useState(false)
  const [fini, setFini] = useState(false)
  const auj = aujourdhui()

  const charger = useCallback(() => {
    lire<PageDossier>(`/api/rh/dossier?jeton=${encodeURIComponent(jeton)}`).then((r) => {
      if (!r.ok) return setPage(r.statut === 404 ? 'introuvable' : 'erreur')
      setPage(r.donnees)
      if (r.donnees.genre === 'benevolat') document.title = 'Dossier de bénévole'
      if (!r.donnees.ferme) setD(depuisPage(r.donnees))
      setFichiers({})
      setFini(false)
    })
  }, [jeton])

  /** Relit la page (une signature vient d'être posée) sans toucher au formulaire en cours. */
  const rafraichir = useCallback(() => {
    lire<PageDossier>(`/api/rh/dossier?jeton=${encodeURIComponent(jeton)}`).then((r) => {
      if (r.ok) setPage(r.donnees)
    })
  }, [jeton])

  useEffect(() => {
    document.title = "Dossier d'embauche"
    document.documentElement.lang = 'fr'
    charger()
  }, [charger])

  if (page === null) return <Message titre="…" />
  if (page === 'introuvable')
    return <Message titre="Dossier d'embauche">Ce lien n'est pas valide. Vérifie que tu as copié l'adresse au complet, ou écris-nous à {COURRIEL_EMPLOIS}.</Message>
  if (page === 'erreur') return <Message titre="Dossier d'embauche">Le dossier ne peut pas se charger pour le moment. Réessaie dans quelques minutes.</Message>
  if (page.ferme)
    return (
      <Message titre="Dossier fermé">
        {page.statut === 'complete'
          ? `Merci ${page.prenom ?? ''} ! Ton dossier a été validé par la direction. Pour un changement, écris-nous à ${COURRIEL_EMPLOIS}.`
          : `Cette embauche a été annulée. Pour toute question, écris-nous à ${COURRIEL_EMPLOIS}.`}
      </Message>
    )
  if (!d) return <Message titre="…" />

  const ete = estEte(page)
  const emploi = page.genre === 'emploi'
  const tailles = Object.fromEntries(Object.entries(fichiers).filter(([, f]) => f).map(([g, f]) => [g, { nom: f!.name, taille: f!.size }]))
  const err = fusionnerErreurs<ChampDossier>(tente ? erreursDossier(d, page, tailles, auj) : {}, champsServeur, erreursFichiers)
  const changer = <K extends keyof DonneesDossier>(cle: K, valeur: DonneesDossier[K]) => {
    setD((x) => (x ? { ...x, [cle]: valeur } : x))
    setChampsServeur((c) => ({ ...c, [cle]: undefined }))
  }
  const q = (cle: ChampDossier) => ({ id: `q-${cle}`, erreur: err[cle] })
  const texte = (cle: keyof DonneesDossier, type = 'text', extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      type={type}
      className={`${ui.champ} ${err[cle] ? 'border-red-400' : ''}`}
      value={d[cle] as string}
      onChange={(e) => changer(cle, e.target.value as DonneesDossier[typeof cle])}
      {...extra}
    />
  )
  const ouiNon = (cle: 'etudiant_temps_plein' | 'allergies_oui') => (
    <Choix
      nom={cle}
      valeur={d[cle]}
      changer={(x) => changer(cle, x)}
      options={[
        { valeur: 'oui', libelle: 'Oui' },
        { valeur: 'non', libelle: 'Non' },
      ]}
    />
  )
  const deja = (genre: string) => {
    const docs = page.documents.filter((x) => x.genre === genre)
    return docs.length ? `Déjà au dossier : ${docs.map((x) => x.nom ?? 'fichier').join(', ')}` : null
  }
  const fichier = (genre: GenreFichierDossier, sorte: 'cv' | 'document' | 'specimen' = 'document') => (
    <ChampFichier
      fichier={fichiers[genre]}
      sorte={sorte}
      deja={genre === 'specimen' ? (page.paie?.specimen && !d.changer_banque ? 'Spécimen déjà au dossier' : null) : deja(genre)}
      changer={(f, m) => {
        setFichiers((x) => ({ ...x, [genre]: f }))
        setErreursFichiers((x) => ({ ...x, [genre]: m ?? undefined }))
        setChampsServeur((c) => ({ ...c, [genre]: undefined }))
      }}
    />
  )
  const mineur = estMineur(d, page, auj)

  const envoyerDossier = async () => {
    setTente(true)
    setMessage(null)
    const premier = Object.keys(fusionnerErreurs<ChampDossier>(erreursDossier(d, page, tailles, auj), erreursFichiers))[0]
    if (premier) {
      setMessage('Quelques réponses sont à compléter ou à corriger (en rouge).')
      document.getElementById(`q-${premier}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setEnvoi(true)
    const fd = new FormData()
    fd.set('jeton', jeton)
    fd.set('donnees', JSON.stringify(d))
    for (const [g, f] of Object.entries(fichiers)) if (f) fd.set(g, await alleger(f))
    const r = await envoyer('/api/rh/dossier', fd)
    setEnvoi(false)
    if (r.statut === 200) {
      setFini(true)
      rafraichir()
      window.scrollTo(0, 0)
      return
    }
    if (r.statut === 422 && r.corps.champs) {
      setChampsServeur(r.corps.champs as Partial<Record<ChampDossier, string>>)
      setMessage('Quelques réponses sont à compléter ou à corriger (en rouge).')
    } else if (r.statut === 409) setMessage(`Ce dossier est fermé (embauche validée ou annulée). Écris-nous à ${COURRIEL_EMPLOIS}.`)
    else if (r.statut === 413) setMessage('Les fichiers joints sont trop lourds ensemble : retire une photo ou joins un PDF plus léger.')
    else setMessage("L'envoi n'a pas fonctionné. Vérifie ta connexion et réessaie.")
  }

  const entete = (
    <Entete
      surtitre={[page.compagnie?.nom, page.saison.nom].filter(Boolean).join(' · ')}
      titre={emploi ? "Dossier d'embauche" : 'Dossier de bénévole'}
      logo={logoDe(page.compagnie)}
      nomLogo={page.compagnie?.nom}
    />
  )

  if (fini) {
    return (
      <Page>
        {entete}
        <div className={`${ui.carte} space-y-3 p-6 text-center`}>
          <p className="text-xl font-semibold text-foret-800">Merci {d.prenom} !</p>
          <p className="text-pierre-700">Ton dossier est bien reçu. La direction le vérifiera ; d'ici là, tu peux le corriger avec ce même lien.</p>
          <button className={ui.boutonSecondaire} onClick={charger}>
            Revoir mon dossier
          </button>
        </div>
        {page.contrat?.statut === 'en_attente' && page.dossier_recu_le && <p className="text-center text-sm font-medium text-pierre-800">Il te reste à signer ton contrat :</p>}
        <SectionContrat jeton={jeton} page={page} rafraichir={rafraichir} />
        {mineur && <SectionConsentement jeton={jeton} page={page} naissance={d.date_naissance} rafraichir={rafraichir} />}
        <PiedEmplois />
      </Page>
    )
  }

  return (
    <Page>
      {entete}
      <div className="space-y-1 text-sm text-pierre-600">
        <p>
          Remplis ce formulaire afin de créer ton dossier {emploi ? "d'employé" : 'de bénévole'}
          {page.poste ? ` (${page.poste})` : ''}. Les champs marqués <span className="text-red-600">*</span> sont obligatoires.
        </p>
        {page.dossier_recu_le && (
          <p className="rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-foret-800">
            Dossier reçu le {dateLongue(page.dossier_recu_le)}. Tu peux le corriger et le renvoyer tant que la direction ne l'a pas validé.
          </p>
        )}
      </div>

      <SectionContrat jeton={jeton} page={page} rafraichir={rafraichir} />

      <form
        noValidate
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          void envoyerDossier()
        }}
      >
        <Bloc titre="Informations générales">
          <div className="grid gap-5 sm:grid-cols-2">
            <Question libelle="Prénom" requis {...q('prenom')}>
              {texte('prenom', 'text', { autoComplete: 'given-name' })}
            </Question>
            <Question libelle="Nom de famille" requis {...q('nom_famille')}>
              {texte('nom_famille', 'text', { autoComplete: 'family-name' })}
            </Question>
            <Question libelle="Nom de camp" {...q('surnom')}>
              {texte('surnom')}
            </Question>
            <Question libelle="Téléphone" requis {...q('telephone')}>
              {texte('telephone', 'tel', { autoComplete: 'tel' })}
            </Question>
            <Question libelle="Date de naissance" requis {...q('date_naissance')}>
              {texte('date_naissance', 'date', { autoComplete: 'bday', max: auj })}
            </Question>
            <Question libelle="Courriel" requis {...q('courriel')}>
              {texte('courriel', 'email', { autoComplete: 'email', inputMode: 'email' })}
            </Question>
          </div>
          <Question libelle="Numéro d'assurance maladie" aide="Si tu n'en as pas, écris « aucun »." requis {...q('assurance_maladie')}>
            {texte('assurance_maladie', 'text', { autoComplete: 'off' })}
          </Question>
          <Question libelle="Adresse (numéro et rue)" requis {...q('adresse')}>
            {texte('adresse', 'text', { autoComplete: 'street-address' })}
          </Question>
          <div className="grid gap-5 sm:grid-cols-2">
            <Question libelle="Code postal" requis {...q('code_postal')}>
              {texte('code_postal', 'text', { autoComplete: 'postal-code' })}
            </Question>
            <Question libelle="Ville" requis {...q('ville')}>
              {texte('ville', 'text', { autoComplete: 'address-level2' })}
            </Question>
            <Question libelle="Province" requis {...q('province')}>
              {texte('province', 'text', { autoComplete: 'address-level1' })}
            </Question>
            <Question libelle="Pays" requis {...q('pays')}>
              {texte('pays', 'text', { autoComplete: 'country-name' })}
            </Question>
          </div>
          <Question libelle="Êtes-vous étudiant à temps plein?" requis {...q('etudiant_temps_plein')}>
            {ouiNon('etudiant_temps_plein')}
          </Question>
          <Question libelle="Si vous êtes aux études, merci de préciser dans quel programme et dans quelle institution." {...q('etudes')}>
            {texte('etudes')}
          </Question>
        </Bloc>

        {emploi && (
          <Bloc titre="Service de paie" note="🔒 Ces renseignements sont chiffrés. Seule la direction peut les consulter, et chaque consultation est notée.">
            <Question libelle="Numéro d'assurance sociale" requis={nasDemande(d, page)} {...q('nas')}>
              {page.paie?.nas_fin && !d.changer_nas ? (
                <AuDossier texte={`NAS au dossier (finit par ${page.paie.nas_fin})`} changer={() => changer('changer_nas', true)} />
              ) : (
                texte('nas', 'text', { inputMode: 'numeric', autoComplete: 'off', placeholder: '000 000 000' })
              )}
            </Question>
            {banqueDemandee(d, page) ? (
              <>
                {page.paie?.compte_fin && <p className="text-xs text-pierre-500">Nouveau compte : donne les trois numéros et un nouveau spécimen.</p>}
                <div className="grid gap-5 sm:grid-cols-2">
                  <Question libelle="Chèque (Transit ou Numéro d'identification)" aide="Numéro de 5 chiffres qui correspond à la succursale de votre banque/caisse." requis {...q('transit')}>
                    {texte('transit', 'text', { inputMode: 'numeric', autoComplete: 'off' })}
                  </Question>
                  <Question libelle="Chèque (Institution financière)" aide="Numéro de 3 chiffres." requis {...q('institution')}>
                    {texte('institution', 'text', { inputMode: 'numeric', autoComplete: 'off' })}
                  </Question>
                </div>
                <Question libelle="Chèque (Numéro de compte ou Folio)" aide="Numéro de normalement 7 chiffres (peut varier d'une institution financière à l'autre)." requis {...q('compte')}>
                  {texte('compte', 'text', { inputMode: 'numeric', autoComplete: 'off' })}
                </Question>
              </>
            ) : (
              <Question libelle="Compte bancaire">
                <AuDossier texte={`Compte au dossier (finit par ${page.paie?.compte_fin})`} changer={() => changer('changer_banque', true)} />
              </Question>
            )}
            <Question libelle="Spécimen chèque" aide="Ou un formulaire de dépôt direct de ta banque. PDF ou photo." requis={specimenExige(d, page)} {...q('specimen')}>
              {fichier('specimen', 'specimen')}
            </Question>
          </Bloc>
        )}

        <Bloc titre="Vie au camp">
          <Question libelle="Avez-vous des allergies ou intolérances?" {...q('allergies_oui')}>
            {ouiNon('allergies_oui')}
          </Question>
          {d.allergies_oui === 'oui' && (
            <Question libelle="Précisez vos allergies" requis {...q('allergies')}>
              {texte('allergies')}
            </Question>
          )}
          <Question libelle="Diète alimentaire" {...q('diete')}>
            <Choix nom="diete" valeur={d.diete} changer={(x) => changer('diete', x)} options={DIETES_DOSSIER.map((x) => ({ valeur: x.id, libelle: x.nom }))} />
          </Question>
          {ete && (
            <div className="grid gap-5 sm:grid-cols-2">
              <Question libelle="Grandeur de t-shirt" {...q('taille_tshirt')}>
                <MenuTaille valeur={d.taille_tshirt} changer={(v) => changer('taille_tshirt', v)} />
              </Question>
              <Question libelle="Grandeur de hoodie (Équipe d'animation BPA et Opikawa uniquement)" {...q('taille_hoodie')}>
                <MenuTaille valeur={d.taille_hoodie} changer={(v) => changer('taille_hoodie', v)} />
              </Question>
            </div>
          )}
        </Bloc>

        <Bloc titre="Contacts d'urgence">
          {([1, 2] as const).map((n) => (
            <div key={n} className="grid gap-3 sm:grid-cols-3">
              <Question libelle={`Contact ${n} — nom complet`}>{texte(`urgence${n}_nom`)}</Question>
              <Question libelle="Lien de parenté">{texte(`urgence${n}_lien`)}</Question>
              <Question libelle="Téléphone">{texte(`urgence${n}_telephone`, 'tel')}</Question>
            </div>
          ))}
        </Bloc>

        {avecDisponibilites(page) && (
          <Bloc titre="Disponibilités">
            {page.dates.length > 0 && (
              <Question libelle="Je serai disponible aux dates suivantes :" {...q('disponibilites')}>
                <Cases
                  options={page.dates.map((x) => ({
                    valeur: x.id,
                    libelle: (
                      <span>
                        {x.nom} — {plage(x.debut, x.fin)}
                        {(x.obligatoire || x.note) && (
                          <span className="text-pierre-500"> ({[x.obligatoire && 'obligatoire', x.note].filter(Boolean).join(' – ')})</span>
                        )}
                      </span>
                    ),
                  }))}
                  valeur={d.disponibilites}
                  changer={(ids) => changer('disponibilites', ids)}
                />
              </Question>
            )}
            <Question libelle="Commentaires et précisions sur les disponibilités (au besoin)">
              <textarea rows={2} className={ui.champ} value={d.disponibilites_note} onChange={(e) => changer('disponibilites_note', e.target.value)} />
            </Question>
          </Bloc>
        )}

        <Bloc titre="Code d'éthique">
          {page.ethique?.texte && (
            <div className="max-h-80 overflow-y-auto rounded-lg border border-pierre-200 bg-pierre-50 p-3">
              <TexteFormate texte={page.ethique.texte} />
            </div>
          )}
          <Question libelle="" requis={false} {...q('ethique')}>
            <Coche checked={d.ethique} changer={(v) => changer('ethique', v)}>
              Je m'engage à respecter le code d'éthique ci-dessus dans le cadre de mon {emploi ? 'contrat' : 'bénévolat'}. <span className="text-red-600">*</span>
            </Coche>
          </Question>
        </Bloc>

        {!emploi && page.entente?.texte.trim() && (
          <Bloc titre="Entente de bénévolat">
            <div className="max-h-80 overflow-y-auto rounded-lg border border-pierre-200 bg-pierre-50 p-3">
              <TexteFormate texte={page.entente.texte} />
            </div>
            <Question libelle="" {...q('entente')}>
              <Coche checked={d.entente} changer={(v) => changer('entente', v)}>
                J'accepte l'entente de bénévolat ci-dessus. <span className="text-red-600">*</span>
              </Coche>
            </Question>
          </Bloc>
        )}

        <Bloc titre="Documents" note="PDF ou photo, 20 Mo au plus par fichier.">
          <Question libelle="CV" requis={cvExige(page)} {...q('cv')}>
            {fichier('cv', 'cv')}
          </Question>
          <Question libelle="Carte de premiers soins" {...q('premiers_soins')}>
            <div className="space-y-2">
              {fichier('premiers_soins')}
              {fichiers.premiers_soins && <DateExpiration valeur={d.expire_premiers_soins} changer={(v) => changer('expire_premiers_soins', v)} erreur={err.expire_premiers_soins} />}
            </div>
          </Question>
          <Question libelle="Carte SN ou autre (Pour tous les sauveteurs - votre plus haute accréditation seulement)" {...q('sauveteur')}>
            <div className="space-y-2">
              {fichier('sauveteur')}
              {fichiers.sauveteur && <DateExpiration valeur={d.expire_sauveteur} changer={(v) => changer('expire_sauveteur', v)} erreur={err.expire_sauveteur} />}
            </div>
          </Question>
          <Question libelle="Permis de conduire (ou autre pièce d'identité)" {...q('piece_identite')}>
            {fichier('piece_identite')}
          </Question>
          {mineur && !page.consentement && (
            <Question
              libelle="Consentement parental signé (Mineur·es seulement)"
              aide="Seulement si ton parent ne peut pas le signer en ligne (section « Consentement parental » plus bas) : joins le formulaire signé."
              {...q('consentement_parental')}
            >
              {fichier('consentement_parental')}
            </Question>
          )}
        </Bloc>

        {mineur && <SectionConsentement jeton={jeton} page={page} naissance={d.date_naissance} rafraichir={rafraichir} />}

        {ete && (
          <>
            <Bloc titre="Présentation de l'équipe sur les médias sociaux" note="Facultatif.">
              <Question libelle="Photo" {...q('photo')}>
                {fichier('photo')}
              </Question>
              <Question libelle="As-tu été campeur.se ou anim avant à la BPA (Si oui, combien d'années?)">{texte('campeur')}</Question>
              <Question libelle="Ton activité préférée à faire au camp ou à tremblant ☀️">{texte('activite')}</Question>
              <Question libelle="Ton repas préféré 🦞">{texte('repas')}</Question>
              <Question libelle="Ta chanson de karaoké de prédilection 🎤">{texte('karaoke')}</Question>
            </Bloc>
            <Bloc titre="Commentaires">
              <Question libelle="N'hésitez pas à nous écrire vos commentaires ou précisions par rapport à votre saison !">
                <textarea rows={3} className={ui.champ} value={d.commentaires} onChange={(e) => changer('commentaires', e.target.value)} />
              </Question>
            </Bloc>
          </>
        )}

        <div className={`${ui.carte} space-y-3 p-5`}>
          {message && <p className={ui.erreur}>{message}</p>}
          <button className={`${ui.bouton} w-full sm:w-auto`} disabled={envoi}>
            {envoi ? 'Envoi…' : page.dossier_recu_le ? 'Renvoyer mon dossier corrigé' : 'Envoyer mon dossier'}
          </button>
        </div>
      </form>
      <PiedEmplois />
    </Page>
  )
}

function Bloc({ titre, note, children }: { titre: string; note?: string; children: ReactNode }) {
  return (
    <section className={`${ui.carte} space-y-5 p-5`}>
      <div>
        <h2 className="text-base font-semibold text-pierre-900">{titre}</h2>
        {note && <p className="mt-0.5 text-xs text-pierre-500">{note}</p>}
      </div>
      {children}
    </section>
  )
}

/** Renseignement déjà au dossier, jamais réaffiché : « le changer ? ». */
function AuDossier({ texte, changer }: { texte: string; changer: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-foret-200 bg-foret-50 px-3 py-2 text-sm text-foret-800">
      <span>✓ {texte}</span>
      <button type="button" className="text-xs text-pierre-600 underline" onClick={changer}>
        le changer ?
      </button>
    </div>
  )
}

function Coche({ checked, changer, children }: { checked: boolean; changer: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? 'border-foret-600 bg-foret-50' : 'border-pierre-200 bg-white'}`}>
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => changer(e.target.checked)} />
      <span>{children}</span>
    </label>
  )
}

function MenuTaille({ valeur, changer }: { valeur: string; changer: (v: string) => void }) {
  return (
    <select className={ui.champ} value={valeur} onChange={(e) => changer(e.target.value)}>
      <option value="">—</option>
      {TAILLES_DOSSIER.map((t) => (
        <option key={t}>{t}</option>
      ))}
    </select>
  )
}

function DateExpiration({ valeur, changer, erreur }: { valeur: string; changer: (v: string) => void; erreur?: string }) {
  return (
    <label className="block text-xs text-pierre-600">
      Date d'expiration de la carte (facultatif)
      <input type="date" className={`${ui.champ} mt-1 ${erreur ? 'border-red-400' : ''}`} value={valeur} onChange={(e) => changer(e.target.value)} />
      {erreur && <span className="mt-1 block text-red-700">{erreur}</span>}
    </label>
  )
}
