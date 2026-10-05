import { useState, type FormEvent, type ReactNode } from 'react'
import { confirmer } from '@/lib/Confirmation'
import { Dialogue } from '@/lib/Dialogue'
import { messageErreur } from '@/lib/donnees'
import { ui } from '@/lib/ui'
import { useEnregistrerLigne, useSupprimerLigne } from './donnees'
import { ajouterMois, aujourdhui, lireNombre, MOIS_ENTRE_INSPECTIONS, trierFlotte, uniteCompteur } from './outils'
import { RESULTATS, type Entretien, type Inspection, type Resultat, type Vehicule } from './types'

const TYPES_INSPECTION = ['Inspection mécanique', 'Inspection maison', 'Vérification des remorques']
const TYPES_ENTRETIEN = ['Vidange', 'Pneus', 'Freins', 'Batterie', 'Réparation', 'Lavage', 'Pièces', 'Carrosserie']

/** Suggestions : les valeurs proposées d'abord, puis celles déjà saisies. */
export function Suggestions({ id, base, deja }: { id: string; base: string[]; deja: (string | null)[] }) {
  const valeurs = [...new Set([...base, ...deja.filter((x): x is string => !!x?.trim())])]
  return (
    <datalist id={id}>
      {valeurs.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  )
}

export function Champ({ libelle, children, className = '' }: { libelle: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={ui.etiquette}>{libelle}</span>
      {children}
    </label>
  )
}

const texte = (v: string) => v.trim() || null

function Boutons({ fermer, enCours, supprimer, valide = true }: { fermer: () => void; enCours: boolean; supprimer?: () => void; valide?: boolean }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      {supprimer && (
        <button type="button" className={ui.boutonDanger} onClick={supprimer}>
          Supprimer
        </button>
      )}
      <button type="button" className={`${ui.boutonSecondaire} ml-auto`} onClick={fermer}>
        Annuler
      </button>
      <button className={ui.bouton} disabled={enCours || !valide}>
        Enregistrer
      </button>
    </div>
  )
}

export function FormInspection({
  vehicule,
  inspection,
  ateliers,
  fermer,
}: {
  vehicule: Vehicule
  inspection?: Inspection
  ateliers: (string | null)[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrerLigne<Inspection>('inspections')
  const supprimer = useSupprimerLigne('inspections')
  const [date, setDate] = useState(inspection?.date ?? aujourdhui())
  const [type, setType] = useState(inspection?.type ?? TYPES_INSPECTION[0])
  const [resultat, setResultat] = useState<Resultat | ''>(inspection?.resultat ?? '')
  const [atelier, setAtelier] = useState(inspection?.atelier ?? '')
  const [cout, setCout] = useState(inspection?.cout?.toString().replace('.', ',') ?? '')
  // Prochaine échéance proposée : 6 mois plus tard, tant qu'on ne l'a pas changée.
  const [prochaine, setProchaine] = useState(inspection ? (inspection.prochaine ?? '') : ajouterMois(date, MOIS_ENTRE_INSPECTIONS))
  const [prochaineTouchee, setProchaineTouchee] = useState(!!inspection)
  const [notes, setNotes] = useState(inspection?.notes ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const montant = lireNombre(cout)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (montant === undefined) return setErreur('Le coût doit être un nombre.')
    try {
      await enregistrer.mutateAsync({
        id: inspection?.id,
        vehicule_id: vehicule.id,
        date,
        type: type.trim() || TYPES_INSPECTION[0],
        resultat: resultat || null,
        atelier: texte(atelier),
        cout: montant,
        prochaine: prochaine || null,
        notes: texte(notes),
      })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function retirer() {
    if (!inspection) return
    const ok = await confirmer({ titre: 'Supprimer cette inspection ?', message: 'Elle sera retirée du registre du véhicule.', libelleOk: 'Supprimer', danger: true })
    if (!ok) return
    supprimer.mutate(inspection.id)
    fermer()
  }

  return (
    <Dialogue titre={`${inspection ? 'Inspection' : 'Nouvelle inspection'} · ${vehicule.surnom}`} fermer={fermer}>
      <form onSubmit={envoyer} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Date">
            <input
              type="date"
              required
              className={ui.champ}
              value={date}
              onChange={(e) => {
                setDate(e.target.value)
                if (!prochaineTouchee && e.target.value) setProchaine(ajouterMois(e.target.value, MOIS_ENTRE_INSPECTIONS))
              }}
            />
          </Champ>
          <Champ libelle="Prochaine inspection">
            <input
              type="date"
              className={ui.champ}
              value={prochaine}
              onChange={(e) => {
                setProchaine(e.target.value)
                setProchaineTouchee(true)
              }}
            />
          </Champ>
        </div>
        <Champ libelle="Type">
          <input className={ui.champ} list="types-inspection" value={type} onChange={(e) => setType(e.target.value)} />
          <Suggestions id="types-inspection" base={TYPES_INSPECTION} deja={[]} />
        </Champ>
        <Champ libelle="Résultat">
          <select className={ui.champ} value={resultat} onChange={(e) => setResultat(e.target.value as Resultat | '')}>
            <option value="">—</option>
            {RESULTATS.map((r) => (
              <option key={r.id} value={r.id}>
                {r.libelle}
              </option>
            ))}
          </select>
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Garage ou inspecteur">
            <input className={ui.champ} list="ateliers" value={atelier} onChange={(e) => setAtelier(e.target.value)} />
            <Suggestions id="ateliers" base={[]} deja={ateliers} />
          </Champ>
          <Champ libelle="Coût ($)">
            <input className={ui.champ} inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value)} />
          </Champ>
        </div>
        <Champ libelle="Notes (défectuosités, suivi…)">
          <textarea className={ui.champ} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Champ>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <Boutons fermer={fermer} enCours={enregistrer.isPending} supprimer={inspection ? retirer : undefined} valide={!!date} />
      </form>
    </Dialogue>
  )
}

export function FormEntretien({
  vehicule,
  vehicules,
  entretien,
  deja,
  fermer,
}: {
  /** Véhicule fixé (depuis sa fiche) ; sinon, choisi dans `vehicules`. */
  vehicule?: Vehicule
  vehicules?: Vehicule[]
  entretien?: Entretien
  /** Entretiens déjà saisis (suggestions de types et de fournisseurs). */
  deja: Entretien[]
  fermer: () => void
}) {
  const enregistrer = useEnregistrerLigne<Entretien>('entretiens')
  const supprimer = useSupprimerLigne('entretiens')
  const [vehiculeId, setVehiculeId] = useState(vehicule?.id ?? entretien?.vehicule_id ?? '')
  const [date, setDate] = useState(entretien?.date ?? aujourdhui())
  const [type, setType] = useState(entretien?.type ?? '')
  const [description, setDescription] = useState(entretien?.description ?? '')
  const [compteur, setCompteur] = useState(entretien?.compteur?.toString() ?? '')
  const [cout, setCout] = useState(entretien?.cout?.toString().replace('.', ',') ?? '')
  const [fournisseur, setFournisseur] = useState(entretien?.fournisseur ?? '')
  const [erreur, setErreur] = useState<string | null>(null)

  const choisi = vehicule ?? vehicules?.find((v) => v.id === vehiculeId)
  const unite = choisi ? uniteCompteur(choisi.type) : null
  const montant = lireNombre(cout)
  const valeurCompteur = lireNombre(compteur)

  async function envoyer(e: FormEvent) {
    e.preventDefault()
    if (montant === undefined) return setErreur('Le coût doit être un nombre.')
    if (valeurCompteur === undefined) return setErreur(`Le ${unite === 'h' ? 'nombre d’heures' : 'kilométrage'} doit être un nombre.`)
    try {
      await enregistrer.mutateAsync({
        id: entretien?.id,
        vehicule_id: vehiculeId,
        date,
        type: type.trim(),
        description: texte(description),
        compteur: unite && valeurCompteur != null ? Math.round(valeurCompteur) : null,
        cout: montant,
        fournisseur: texte(fournisseur),
      })
      fermer()
    } catch (err) {
      setErreur(messageErreur(err))
    }
  }

  async function retirer() {
    if (!entretien) return
    const ok = await confirmer({ titre: 'Supprimer cet entretien ?', message: 'Il sera retiré du registre.', libelleOk: 'Supprimer', danger: true })
    if (!ok) return
    supprimer.mutate(entretien.id)
    fermer()
  }

  const titre = entretien ? 'Entretien' : 'Nouvel entretien'
  return (
    <Dialogue titre={vehicule ? `${titre} · ${vehicule.surnom}` : titre} fermer={fermer}>
      <form onSubmit={envoyer} className="space-y-3">
        {!vehicule && (
          <Champ libelle="Véhicule">
            <select required className={ui.champ} value={vehiculeId} onChange={(e) => setVehiculeId(e.target.value)}>
              <option value="">Choisir…</option>
              {trierFlotte(vehicules ?? []).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.surnom}
                </option>
              ))}
            </select>
          </Champ>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Champ libelle="Date">
            <input type="date" required className={ui.champ} value={date} onChange={(e) => setDate(e.target.value)} />
          </Champ>
          <Champ libelle="Type">
            <input required className={ui.champ} list="types-entretien" value={type} onChange={(e) => setType(e.target.value)} />
            <Suggestions id="types-entretien" base={TYPES_ENTRETIEN} deja={deja.map((x) => x.type)} />
          </Champ>
        </div>
        <Champ libelle="Description">
          <textarea className={ui.champ} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          {unite && (
            <Champ libelle={unite === 'h' ? 'Heures au compteur' : 'Kilométrage'}>
              <input className={ui.champ} inputMode="numeric" value={compteur} onChange={(e) => setCompteur(e.target.value)} />
            </Champ>
          )}
          <Champ libelle="Coût ($)">
            <input className={ui.champ} inputMode="decimal" value={cout} onChange={(e) => setCout(e.target.value)} />
          </Champ>
        </div>
        <Champ libelle="Garage ou fournisseur">
          <input className={ui.champ} list="fournisseurs" value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} />
          <Suggestions id="fournisseurs" base={[]} deja={deja.map((x) => x.fournisseur)} />
        </Champ>
        {erreur && <p className={ui.erreur}>{erreur}</p>}
        <Boutons
          fermer={fermer}
          enCours={enregistrer.isPending}
          supprimer={entretien ? retirer : undefined}
          valide={!!date && !!type.trim() && !!vehiculeId}
        />
      </form>
    </Dialogue>
  )
}
