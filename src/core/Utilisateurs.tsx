import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { BoutonModifier } from '@/lib/BoutonsAction'
import { messageErreur } from '@/lib/donnees'
import { IconeInterdit, IconeOeil, IconeRenommer } from '@/lib/icones'
import { supabase } from '@/lib/supabase'
import type { AccesModule, AccesRole, ModuleId, Niveau, Profil, Role } from '@/lib/types'
import { ui } from '@/lib/ui'
import { useAuth } from '@/shell/auth'
import { niveauModule } from '@/shell/acces'
import { MODULES } from '@/shell/modules'

const ROLES: { id: Role; libelle: string }[] = [
  { id: 'admin', libelle: 'Administrateur' },
  { id: 'direction', libelle: 'Direction' },
  { id: 'coordo', libelle: 'Coordonnateur' },
  { id: 'terrain', libelle: 'Terrain' },
]

const LIBELLE_ROLE = Object.fromEntries(ROLES.map((r) => [r.id, r.libelle])) as Record<Role, string>
/** Colonnes de la grille d'accès par rôle (l'admin a tout). */
const ROLES_GRILLE: AccesRole['role'][] = ['direction', 'coordo', 'terrain']

const LIBELLE_NIVEAU: Record<Niveau, string> = { lecture: 'Lecture', ecriture: 'Écriture' }

/** Icône et couleur de chaque niveau : aucun (interdit), lecture (œil), écriture (crayon). */
const STYLE_NIVEAU: Record<Niveau | '', { Icone: typeof IconeOeil; icone: string; fond: string }> = {
  '': { Icone: IconeInterdit, icone: 'text-pierre-400', fond: 'bg-white text-pierre-500' },
  lecture: { Icone: IconeOeil, icone: 'text-sky-700', fond: 'bg-sky-50 text-sky-900' },
  ecriture: { Icone: IconeRenommer, icone: 'text-foret-700', fond: 'bg-foret-50 text-foret-800' },
}

/**
 * Choix du niveau d'accès d'un module, avec l'icône du niveau devant.
 * `niveauIcone` : niveau illustré quand il diffère de la valeur (accès
 * personnel vide = niveau du rôle).
 */
function ChoixNiveau({
  valeur,
  niveauIcone = valeur,
  libelleVide = 'Aucun',
  sansLecture,
  petit,
  disabled,
  changer,
}: {
  valeur: Niveau | ''
  niveauIcone?: Niveau | ''
  libelleVide?: string
  sansLecture?: boolean
  petit?: boolean
  disabled?: boolean
  changer: (n: Niveau | '') => void
}) {
  const { Icone, icone, fond } = STYLE_NIVEAU[niveauIcone]
  return (
    <span className={`relative ${petit ? 'inline-block' : 'block'}`}>
      <Icone
        className={`pointer-events-none absolute top-1/2 -translate-y-1/2 ${petit ? 'left-1.5 size-3.5' : 'left-2.5 size-4'} ${icone}`}
      />
      <select
        className={`rounded-lg border border-pierre-300 focus:border-foret-600 focus:outline-none focus:ring-2 focus:ring-foret-600/20 disabled:opacity-50 ${fond} ${
          petit ? 'py-0.5 pr-1 pl-6 text-xs' : 'w-full py-2 pr-3 pl-8 text-sm'
        }`}
        value={valeur}
        disabled={disabled}
        onChange={(e) => changer(e.target.value as Niveau | '')}
      >
        <option value="">{libelleVide}</option>
        {!sansLecture && <option value="lecture">Lecture</option>}
        <option value="ecriture">Écriture</option>
      </select>
    </span>
  )
}

/** Gestion des rôles et des accès. Réservé aux administrateurs. */
export function Utilisateurs() {
  const { profil: moi } = useAuth()
  const client = useQueryClient()
  const [erreur, setErreur] = useState<string | null>(null)

  const { data } = useQuery({
    queryKey: ['utilisateurs'],
    queryFn: async () => {
      const [profils, acces, roles] = await Promise.all([
        supabase.schema('core').from('profils').select('*').order('courriel'),
        supabase.schema('core').from('acces_modules').select('*'),
        supabase.schema('core').from('acces_roles').select('*'),
      ])
      if (profils.error) throw profils.error
      if (acces.error) throw acces.error
      if (roles.error) throw roles.error
      return { profils: profils.data as Profil[], acces: acces.data as AccesModule[], roles: roles.data as AccesRole[] }
    },
  })

  const rafraichir = () => {
    setErreur(null)
    client.invalidateQueries({ queryKey: ['utilisateurs'] })
    client.invalidateQueries({ queryKey: ['droits'] })
  }
  const surErreur = (e: unknown) => setErreur(messageErreur(e))

  const majProfil = useMutation({
    mutationFn: async ({ id, ...valeurs }: Partial<Profil> & { id: string }) => {
      const { error } = await supabase.schema('core').from('profils').update(valeurs).eq('id', id)
      if (error) throw error
    },
    onSuccess: rafraichir,
    onError: surErreur,
  })

  const majAcces = useMutation({
    mutationFn: async ({ user_id, module, niveau }: { user_id: string; module: ModuleId; niveau: Niveau | '' }) => {
      const table = supabase.schema('core').from('acces_modules')
      const { error } = niveau
        ? await table.upsert({ user_id, module, niveau })
        : await table.delete().eq('user_id', user_id).eq('module', module)
      if (error) throw error
    },
    onSuccess: rafraichir,
    onError: surErreur,
  })

  const majRole = useMutation({
    mutationFn: async ({ role, module, niveau }: { role: AccesRole['role']; module: ModuleId; niveau: Niveau | '' }) => {
      const table = supabase.schema('core').from('acces_roles')
      const { error } = niveau
        ? await table.upsert({ role, module, niveau })
        : await table.delete().eq('role', role).eq('module', module)
      if (error) throw error
    },
    onSuccess: rafraichir,
    onError: surErreur,
  })

  const [ouvert, setOuvert] = useState<string | null>(null)
  const roles = data?.roles ?? []
  const persoDe = (userId: string) => data?.acces.filter((a) => a.user_id === userId) ?? []
  const niveauRole = (role: AccesRole['role'], m: ModuleId) =>
    roles.find((r) => r.role === role && r.module === m)?.niveau ?? ''

  return (
    <div>
      <h1 className="text-2xl font-semibold">Utilisateurs</h1>
      <div className="mt-3 rounded-lg bg-pierre-100 px-3 py-2 text-sm text-pierre-700">
        <strong>Inviter quelqu'un :</strong> Supabase → Authentication → Users → <em>Invite user</em>. La
        personne apparaît ici dès l'invitation, avec le rôle <strong>Terrain</strong> (elle ne voit que
        Travaux) : pour un membre de la direction ou un coordonnateur, change son rôle ci-dessous. Elle se
        connecte ensuite sur le site avec son adresse (code par courriel), même si le lien d'invitation a expiré.
      </div>
      {erreur && <p className={`${ui.erreur} mt-3`}>{erreur}</p>}

      <div className={`${ui.carte} mt-5 overflow-x-auto`}>
        <table className="w-full text-sm">
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Courriel</th>
              <th className="px-3 py-2 font-medium">Nom</th>
              <th className="px-3 py-2 font-medium">Rôle</th>
              <th className="px-3 py-2 font-medium">Accès</th>
              <th className="px-3 py-2 font-medium">Actif</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {data?.profils.map((p) => {
              const soiMeme = p.id === moi?.id
              return (
                <Fragment key={p.id}>
                  <tr>
                    <td className="px-3 py-2">{p.courriel}</td>
                    <td className="px-3 py-2">
                      <input
                        className={`${ui.champ} min-w-36`}
                        defaultValue={p.nom ?? ''}
                        onBlur={(e) => {
                          const nom = e.target.value.trim() || null
                          if (nom !== p.nom) majProfil.mutate({ id: p.id, nom })
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className={`${ui.champ} min-w-36`}
                        value={p.role}
                        disabled={soiMeme}
                        title={soiMeme ? 'Vous ne pouvez pas changer votre propre rôle.' : undefined}
                        onChange={(e) => majProfil.mutate({ id: p.id, role: e.target.value as Role })}
                      >
                        {ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.libelle}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      {p.role === 'admin' ? (
                        <span className="text-pierre-500">Tous les modules</span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="flex flex-wrap gap-1 text-base">
                            {MODULES.map((m) => ({ m, n: niveauModule(p.role, roles, persoDe(p.id), m.id) }))
                              .filter(({ n }) => n)
                              .map(({ m, n }) => (
                                <span key={m.id} title={`${m.nom} : ${LIBELLE_NIVEAU[n!].toLowerCase()}`}>
                                  {m.icone}
                                </span>
                              ))}
                          </span>
                          <BoutonModifier
                            className={ouvert === p.id ? 'bg-foret-100!' : ''}
                            title="Ajouter un module à cette personne"
                            aria-expanded={ouvert === p.id}
                            onClick={() => setOuvert(ouvert === p.id ? null : p.id)}
                          />
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-foret-700"
                        checked={p.actif}
                        disabled={soiMeme}
                        onChange={(e) => majProfil.mutate({ id: p.id, actif: e.target.checked })}
                      />
                    </td>
                  </tr>
                  {ouvert === p.id && p.role !== 'admin' && (
                    <tr className="bg-pierre-50">
                      <td colSpan={5} className="px-3 py-3">
                        <p className="text-xs text-pierre-500">
                          Modules en plus de ceux du rôle {LIBELLE_ROLE[p.role]}. Le niveau le plus élevé l'emporte.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                          {MODULES.filter((m) => !m.accesFixe).map((m) => {
                            const a = persoDe(p.id).find((x) => x.module === m.id)
                            const base = niveauRole(p.role as AccesRole['role'], m.id)
                            return (
                              <label key={m.id} className="flex items-center gap-1.5 whitespace-nowrap">
                                {m.icone} {m.nom}
                                <ChoixNiveau
                                  petit
                                  valeur={a?.niveau ?? ''}
                                  niveauIcone={a?.niveau ?? base}
                                  libelleVide={base ? `Rôle : ${LIBELLE_NIVEAU[base].toLowerCase()}` : 'Aucun'}
                                  sansLecture={m.sansLecture}
                                  changer={(niveau) => majAcces.mutate({ user_id: p.id, module: m.id, niveau })}
                                />
                              </label>
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 text-lg font-semibold">Accès par rôle</h2>
      <p className="mt-1 text-sm text-pierre-500">
        Les administrateurs ont accès à tout. Pour donner un module de plus à une seule personne : « Modifier »
        sur sa ligne, ci-dessus. Le niveau le plus élevé l'emporte.
      </p>
      <div className={`${ui.carte} mt-3 max-w-3xl overflow-x-auto`}>
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-60" />
            {ROLES_GRILLE.map((role) => (
              <col key={role} />
            ))}
          </colgroup>
          <thead className="border-b border-pierre-200 bg-pierre-50 text-left text-pierre-500">
            <tr>
              <th className="px-3 py-2 font-medium">Module</th>
              <th className="px-3 py-2 font-medium">Direction</th>
              <th className="px-3 py-2 font-medium">Coordonnateurs</th>
              <th className="px-3 py-2 font-medium" title="Aides de camp, équipe d'entretien">Terrain</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-pierre-100">
            {MODULES.map((m) => (
              <tr key={m.id}>
                <td className="truncate px-3 py-2 whitespace-nowrap" title={m.nom}>
                  {m.icone} {m.nom}
                </td>
                {m.accesFixe ? (
                  <td colSpan={ROLES_GRILLE.length} className="px-3 py-2 text-pierre-500">
                    🔒 {m.accesFixe}
                  </td>
                ) : (
                  ROLES_GRILLE.map((role) => (
                    <td key={role} className="px-3 py-2">
                      <ChoixNiveau
                        valeur={niveauRole(role, m.id)}
                        sansLecture={m.sansLecture}
                        disabled={!data}
                        changer={(niveau) => majRole.mutate({ role, module: m.id, niveau })}
                      />
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
