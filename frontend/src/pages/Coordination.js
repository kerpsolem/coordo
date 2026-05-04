import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Trash2, Download, Copy, RefreshCw, ChevronDown, ChevronRight, Check } from 'lucide-react';

const TYPE_BADGE = {
  CM: { bg: 'bg-yellow-300', text: 'text-yellow-900' },
  CMo: { bg: 'bg-blue-300', text: 'text-blue-900' },
  TD: { bg: 'bg-green-300', text: 'text-green-900' },
  TP: { bg: 'bg-orange-300', text: 'text-orange-900' },
  TPG: { bg: 'bg-orange-400', text: 'text-orange-900' },
  EVAL: { bg: 'bg-red-300', text: 'text-red-900' },
};

const GROUPES_PRESETS = ['Promo entière', 'Groupe 1', 'Groupe 2', 'Groupe 3', 'Demi-promo', '1/4 promo'];

export function FichesProjets() {
  const { isAdmin } = useAuth();
  const [fiches, setFiches] = useState([]);
  const [ues, setUes] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [collapsed, setCollapsed] = useState({});
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneForm, setCloneForm] = useState({ source_promotion_id: '', target_promotion_id: '', replace_existing: false });
  const [cloneLoading, setCloneLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filterPromo !== 'all') params.promotion_id = filterPromo;
      if (filterSemestre !== 'all') params.semestre = filterSemestre;
      const [fr, ur, pr, ar, fmr] = await Promise.all([
        API.get('/fiches-projet', { params }),
        API.get('/ues'), API.get('/promotions'),
        API.get('/activity-types'), API.get('/formateurs')
      ]);
      setFiches(fr.data); setUes(ur.data); setPromotions(pr.data); setActTypes(ar.data); setFormateurs(fmr.data);
    } catch (e) { console.error(e); }
  }, [filterPromo, filterSemestre]);

  useEffect(() => { load(); }, [load]);

  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const atByName = Object.fromEntries(actTypes.map(a => [a.nom, a]));

  // Auto-save with debounce per fiche
  const saveFiche = async (fiche) => {
    try {
      await API.put(`/fiches-projet/${fiche.id}`, fiche);
    } catch (e) { console.error('Save failed:', e); }
  };

  const updateActivite = (ficheId, idx, patch) => {
    setFiches(prev => prev.map(f => {
      if (f.id !== ficheId) return f;
      const acts = [...(f.activites || [])];
      acts[idx] = { ...acts[idx], ...patch };
      const updated = { ...f, activites: acts };
      // Debounced save
      clearTimeout(window[`__save_${ficheId}`]);
      window[`__save_${ficheId}`] = setTimeout(() => saveFiche(updated), 600);
      return updated;
    }));
  };

  const addActivite = (ficheId) => {
    setFiches(prev => prev.map(f => {
      if (f.id !== ficheId) return f;
      const acts = f.activites || [];
      const updated = {
        ...f,
        activites: [...acts, {
          nom: '', heures: 2, type_activite_id: atByName.CM?.id || '',
          taille_groupe: 'Promo entière', ordre: acts.length,
          obligatoire: true, semaine_souhaitee: '',
          formateur_ids: [], methodologie: '', objectifs: '', remarques: ''
        }]
      };
      saveFiche(updated);
      return updated;
    }));
  };

  const removeActivite = (ficheId, idx) => {
    setFiches(prev => prev.map(f => {
      if (f.id !== ficheId) return f;
      const acts = [...(f.activites || [])];
      acts.splice(idx, 1);
      const updated = { ...f, activites: acts };
      saveFiche(updated);
      return updated;
    }));
  };

  const importUEs = async () => {
    try {
      const { data } = await API.post('/fiches-projet/import-ues');
      alert(`Import: ${data.created} cree(s), ${data.skipped} deja existante(s).`);
      load();
    } catch (e) { console.error(e); alert('Erreur'); }
  };

  const importSessions = async () => {
    try {
      const { data } = await API.post('/fiches-projet/import-sessions');
      alert(`Import: ${data.activites_added} activite(s), ${data.fiches_created} fiche(s) sur ${data.sessions_total} seance(s).`);
      load();
    } catch (e) { console.error(e); alert('Erreur'); }
  };

  const runClone = async () => {
    if (!cloneForm.source_promotion_id || !cloneForm.target_promotion_id) { alert('Selectionnez les promotions'); return; }
    if (cloneForm.source_promotion_id === cloneForm.target_promotion_id) { alert('Source et cible identiques'); return; }
    setCloneLoading(true);
    try {
      const { data } = await API.post('/fiches-projet/clone-promotion', cloneForm);
      alert(`Clone : ${data.cloned} fiche(s).`);
      setShowCloneDialog(false); load();
    } catch (e) { alert(e?.response?.data?.detail || 'Erreur'); }
    setCloneLoading(false);
  };

  // Sort fiches: by UE code then promo
  const sortedFiches = [...fiches].sort((a, b) => {
    const ua = ueMap[a.ue_id]?.code_ue || '';
    const ub = ueMap[b.ue_id]?.code_ue || '';
    return ua.localeCompare(ub);
  });

  return (
    <div className="space-y-3" data-testid="fiches-projets-tab">
      {/* Filters and actions */}
      <Card className="p-4 bg-blue-900 dark:bg-blue-950 text-white border-0">
        <h2 className="text-center text-base font-bold tracking-wider uppercase">Déroulement des séquences de l'UE</h2>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="flex items-end gap-2 flex-wrap">
          <Select value={filterPromo} onValueChange={setFilterPromo}>
            <SelectTrigger className="h-9 w-44 text-sm" data-testid="filter-promo"><SelectValue placeholder="Promotion" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les promos</SelectItem>
              {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSemestre} onValueChange={setFilterSemestre}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Semestre" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous semestres</SelectItem>
              {['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="text-xs text-slate-500 ml-2">{sortedFiches.length} UEs affichées</span>
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={importSessions}><RefreshCw size={14} className="mr-1" />Récup. séances</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(true)}><Copy size={14} className="mr-1" />Cloner</Button>
            <Button variant="outline" size="sm" onClick={importUEs}><Download size={14} className="mr-1" />Importer UE</Button>
          </div>
        )}
      </div>

      {/* Liste des fiches par UE */}
      {sortedFiches.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500">Aucune fiche projet. Cliquez sur "Importer UE" pour démarrer.</Card>
      ) : sortedFiches.map(fiche => {
        const ue = ueMap[fiche.ue_id];
        const acts = fiche.activites || [];
        const totalH = acts.reduce((s, a) => s + (parseFloat(a.heures) || 0), 0);
        const planned = acts.filter(a => a.session_id).length;
        const isCollapsed = collapsed[fiche.id];
        return (
          <Card key={fiche.id} className="overflow-hidden" data-testid={`fiche-${fiche.id}`}>
            {/* Header bleu nuit */}
            <div className="bg-blue-900 dark:bg-blue-950 text-white px-4 py-2.5 flex items-center justify-between">
              <button onClick={() => setCollapsed(c => ({ ...c, [fiche.id]: !c[fiche.id] }))} className="flex items-center gap-2 hover:opacity-80">
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="font-bold text-sm">{ue?.code_ue || 'UE ?'} — {ue?.intitule || ''}</span>
                {fiche.semestre && <span className="text-[10px] px-1.5 py-0.5 bg-blue-700 rounded">{fiche.semestre}</span>}
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-blue-200">{acts.length} séquence{acts.length !== 1 ? 's' : ''} · {totalH.toFixed(1)}h{planned > 0 && ` · ${planned}/${acts.length} planifiées`}</span>
                {isAdmin && <Button size="sm" variant="ghost" className="h-7 text-xs text-white hover:bg-blue-800" onClick={() => addActivite(fiche.id)} data-testid={`add-line-${fiche.id}`}><Plus size={12} className="mr-1" />Ligne</Button>}
              </div>
            </div>

            {/* Tableau */}
            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-10">N°</th>
                      <th className="px-2 py-1.5 text-left">Intitulé de la séquence</th>
                      <th className="px-2 py-1.5 text-left w-20">Type</th>
                      <th className="px-2 py-1.5 text-left">Méthodologie</th>
                      <th className="px-2 py-1.5 text-left">Objectifs</th>
                      <th className="px-2 py-1.5 text-center w-16">Temps (h)</th>
                      <th className="px-2 py-1.5 text-center w-16">Oblig.</th>
                      <th className="px-2 py-1.5 text-center w-20">N° Sem.</th>
                      <th className="px-2 py-1.5 text-left w-32">Taille groupe</th>
                      <th className="px-2 py-1.5 text-left w-32">Intervenants</th>
                      <th className="px-2 py-1.5 text-left">Remarques</th>
                      <th className="px-2 py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {acts.length === 0 && (
                      <tr><td colSpan={12} className="text-center py-4 text-slate-400">Aucune séquence. Cliquez "Ligne" pour ajouter.</td></tr>
                    )}
                    {acts.map((act, idx) => {
                      const at = atMap[act.type_activite_id];
                      const badge = at ? TYPE_BADGE[at.nom] : null;
                      return (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="px-2 py-1.5 text-slate-400 text-center">{idx + 1}</td>
                          <td className="px-2 py-1"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-1" placeholder="Intitulé..." value={act.nom || ''} onChange={e => updateActivite(fiche.id, idx, { nom: e.target.value })} disabled={!isAdmin} /></td>
                          <td className="px-1 py-1">
                            {isAdmin ? (
                              <Select value={act.type_activite_id || ''} onValueChange={v => updateActivite(fiche.id, idx, { type_activite_id: v })}>
                                <SelectTrigger className={`h-7 px-1.5 text-[11px] font-bold border-0 shadow-none ${badge ? `${badge.bg} ${badge.text}` : ''}`}>
                                  <SelectValue placeholder="—" />
                                </SelectTrigger>
                                <SelectContent>{actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent>
                              </Select>
                            ) : (
                              at && <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${badge?.bg || 'bg-slate-200'} ${badge?.text || ''}`}>{at.nom}</span>
                            )}
                          </td>
                          <td className="px-2 py-1"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-1" placeholder="Méthode..." value={act.methodologie || ''} onChange={e => updateActivite(fiche.id, idx, { methodologie: e.target.value })} disabled={!isAdmin} /></td>
                          <td className="px-2 py-1"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-1" placeholder="Objectifs..." value={act.objectifs || ''} onChange={e => updateActivite(fiche.id, idx, { objectifs: e.target.value })} disabled={!isAdmin} /></td>
                          <td className="px-1 py-1"><Input type="number" step="0.1" min="0" className="h-7 text-xs text-center border-0 shadow-none focus-visible:ring-1" value={act.heures ?? ''} onChange={e => updateActivite(fiche.id, idx, { heures: parseFloat(e.target.value) || 0 })} disabled={!isAdmin} /></td>
                          <td className="px-1 py-1 text-center">
                            <button type="button" onClick={() => isAdmin && updateActivite(fiche.id, idx, { obligatoire: !act.obligatoire })} disabled={!isAdmin}
                              className={`w-5 h-5 rounded inline-flex items-center justify-center ${act.obligatoire ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
                              {act.obligatoire && <Check size={12} className="text-white" />}
                            </button>
                          </td>
                          <td className="px-1 py-1"><Input className="h-7 text-xs text-center border-0 shadow-none focus-visible:ring-1" placeholder="S15" value={act.semaine_souhaitee || ''} onChange={e => updateActivite(fiche.id, idx, { semaine_souhaitee: e.target.value })} disabled={!isAdmin} /></td>
                          <td className="px-1 py-1">
                            {isAdmin ? (
                              <Select value={act.taille_groupe || 'Promo entière'} onValueChange={v => updateActivite(fiche.id, idx, { taille_groupe: v })}>
                                <SelectTrigger className="h-7 text-[11px] border-0 shadow-none"><SelectValue /></SelectTrigger>
                                <SelectContent>{GROUPES_PRESETS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                              </Select>
                            ) : <span className="text-[11px]">{act.taille_groupe}</span>}
                          </td>
                          <td className="px-1 py-1">
                            {isAdmin ? (
                              <FormateurMultiSelect formateurs={formateurs} selected={act.formateur_ids || []} onChange={ids => updateActivite(fiche.id, idx, { formateur_ids: ids })} />
                            ) : (
                              <span className="text-[11px]" title={(act.formateur_ids || []).map(id => fmMap[id] && `${fmMap[id].prenom} ${fmMap[id].nom}`).filter(Boolean).join(', ')}>
                                {(act.formateur_ids || []).map(id => fmMap[id]?.initiales).filter(Boolean).join(', ')}
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1"><Input className="h-7 text-xs border-0 shadow-none focus-visible:ring-1" placeholder="Remarques..." value={act.remarques || ''} onChange={e => updateActivite(fiche.id, idx, { remarques: e.target.value })} disabled={!isAdmin} /></td>
                          <td className="px-1 py-1 text-right">
                            {isAdmin && (
                              <button onClick={() => removeActivite(fiche.id, idx)} className="text-red-400 hover:text-red-600 p-1" data-testid={`remove-act-${fiche.id}-${idx}`}>
                                <Trash2 size={12} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

      {/* Clone Dialog */}
      <Dialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Cloner depuis une promotion</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">Toutes les fiches de la promotion source seront recréées pour la promotion cible.</p>
            <div>
              <Label className="text-xs">Source</Label>
              <Select value={cloneForm.source_promotion_id} onValueChange={v => setCloneForm({ ...cloneForm, source_promotion_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Cible</Label>
              <Select value={cloneForm.target_promotion_id} onValueChange={v => setCloneForm({ ...cloneForm, target_promotion_id: v })}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cloneForm.replace_existing} onChange={e => setCloneForm({ ...cloneForm, replace_existing: e.target.checked })} />
              Remplacer les fiches existantes
            </label>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(false)} disabled={cloneLoading}>Annuler</Button>
              <Button size="sm" onClick={runClone} disabled={cloneLoading}>{cloneLoading ? 'Clonage...' : 'Cloner'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Multi-select formateur (popover-like checkbox list)
function FormateurMultiSelect({ formateurs, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const sel = selected || [];
  const display = sel.map(id => formateurs.find(f => f.id === id)?.initiales).filter(Boolean).join(', ');
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)} className="w-full h-7 px-2 text-[11px] text-left rounded hover:bg-slate-100 dark:hover:bg-slate-800 truncate" title={display}>
        {display || <span className="text-slate-400">Choisir...</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-56 max-h-60 overflow-y-auto bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 p-1">
            {formateurs.map(f => {
              const checked = sel.includes(f.id);
              return (
                <label key={f.id} className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                  <input type="checkbox" checked={checked} onChange={e => {
                    onChange(e.target.checked ? [...sel, f.id] : sel.filter(i => i !== f.id));
                  }} />
                  <span className="font-mono font-bold">{f.initiales}</span>
                  <span className="text-slate-500 truncate">{f.prenom} {f.nom}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Default export = standalone page (kept for backwards compatibility)
export default function Coordination() {
  return <div className="space-y-4" data-testid="coordination-page"><FichesProjets /></div>;
}
