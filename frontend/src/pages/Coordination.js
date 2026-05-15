import { useState, useEffect, useCallback, useRef, memo } from 'react';
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

// Build list of ISO weeks from a Date by going N weeks forward and back
function buildWeekOptions(refDate = new Date(), backWeeks = 8, fwdWeeks = 60) {
  const opts = [];
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const refMon = new Date(d.setDate(diff));
  for (let i = -backWeeks; i <= fwdWeeks; i++) {
    const mon = new Date(refMon);
    mon.setDate(refMon.getDate() + i * 7);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    const tmp = new Date(Date.UTC(mon.getFullYear(), mon.getMonth(), mon.getDate()));
    tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((tmp - yearStart) / 86400000) + 1) / 7);
    const fmtFr = (date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    opts.push({
      value: `S${weekNo}`,
      label: `S${weekNo} · ${fmtFr(mon)} → ${fmtFr(fri)} ${tmp.getUTCFullYear()}`,
      year: tmp.getUTCFullYear(),
      week: weekNo,
    });
  }
  return opts;
}

// ----- Memoized row to avoid re-render of all rows on each keystroke -----
const ActiviteRow = memo(function ActiviteRow({
  ficheId, idx, act, isAdmin, atMap, actTypes, formateurs, fmMap, weekOptions, groups, onUpdate, onRemove
}) {
  const [localNom, setLocalNom] = useState(act.nom || '');
  const [localHeures, setLocalHeures] = useState(act.heures ?? '');
  const [localNbForm, setLocalNbForm] = useState(act.nb_formateurs ?? '');
  const [localRemarques, setLocalRemarques] = useState(act.remarques || '');
  const debTimer = useRef(null);

  // Sync if act changes externally (e.g. after server save)
  useEffect(() => { setLocalNom(act.nom || ''); }, [act.nom]);
  useEffect(() => { setLocalHeures(act.heures ?? ''); }, [act.heures]);
  useEffect(() => { setLocalNbForm(act.nb_formateurs ?? ''); }, [act.nb_formateurs]);
  useEffect(() => { setLocalRemarques(act.remarques || ''); }, [act.remarques]);

  const scheduleUpdate = (patch) => {
    clearTimeout(debTimer.current);
    debTimer.current = setTimeout(() => onUpdate(ficheId, idx, patch), 500);
  };

  const at = atMap[act.type_activite_id];
  const badge = at ? TYPE_BADGE[at.nom] : null;

  return (
    <tr className={`border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/30 ${!act.semaine_souhaitee ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''}`}>
      <td className="px-2 py-1.5 text-slate-400 text-center relative">
        {idx + 1}
        {!act.semaine_souhaitee && (
          <span className="absolute -left-0.5 top-1/2 -translate-y-1/2 w-1 h-5 bg-amber-400 rounded-r" title="À programmer (pas de semaine)" />
        )}
      </td>
      <td className="px-2 py-1">
        <Input
          className="h-8 text-xs border-0 shadow-none focus-visible:ring-1"
          placeholder="Intitulé..."
          value={localNom}
          onChange={(e) => { setLocalNom(e.target.value); scheduleUpdate({ nom: e.target.value }); }}
          onBlur={() => { clearTimeout(debTimer.current); onUpdate(ficheId, idx, { nom: localNom }); }}
          disabled={!isAdmin}
        />
      </td>
      <td className="px-1 py-1">
        {isAdmin ? (
          <Select value={act.type_activite_id || ''} onValueChange={(v) => onUpdate(ficheId, idx, { type_activite_id: v })}>
            <SelectTrigger className={`h-8 px-1.5 text-[11px] font-bold border-0 shadow-none ${badge ? `${badge.bg} ${badge.text}` : ''}`}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>{actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          at && <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${badge?.bg || 'bg-slate-200'} ${badge?.text || ''}`}>{at.nom}</span>
        )}
      </td>
      <td className="px-1 py-1">
        <Input
          type="number" step="0.5" min="0"
          className="h-8 w-20 text-sm font-semibold text-center border border-slate-200 dark:border-slate-700 shadow-none focus-visible:ring-1"
          value={localHeures}
          onChange={(e) => { setLocalHeures(e.target.value); scheduleUpdate({ heures: parseFloat(e.target.value) || 0 }); }}
          onBlur={() => { clearTimeout(debTimer.current); onUpdate(ficheId, idx, { heures: parseFloat(localHeures) || 0 }); }}
          disabled={!isAdmin}
          data-testid={`act-heures-${ficheId}-${idx}`}
        />
      </td>
      <td className="px-1 py-1 text-center">
        <button type="button" onClick={() => isAdmin && onUpdate(ficheId, idx, { obligatoire: !act.obligatoire })} disabled={!isAdmin}
          className={`w-5 h-5 rounded inline-flex items-center justify-center ${act.obligatoire ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`}>
          {act.obligatoire && <Check size={12} className="text-white" />}
        </button>
      </td>
      <td className="px-1 py-1">
        {isAdmin ? (
          <Select value={act.semaine_souhaitee || ''} onValueChange={(v) => onUpdate(ficheId, idx, { semaine_souhaitee: v === '__none__' ? '' : v })}>
            <SelectTrigger className="h-8 text-[11px] border-0 shadow-none"><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__none__">— (aucune)</SelectItem>
              {weekOptions.map(w => <SelectItem key={`${w.year}-${w.week}`} value={w.value}>{w.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : <span className="text-[11px]">{act.semaine_souhaitee || '—'}</span>}
      </td>
      <td className="px-1 py-1">
        {isAdmin ? (
          <GroupMultiSelect
            groups={groups || []}
            tailleGroupe={act.taille_groupe || 'Promo entière'}
            selected={act.group_ids || []}
            onChangeTaille={(v) => onUpdate(ficheId, idx, { taille_groupe: v })}
            onChangeGroups={(ids) => onUpdate(ficheId, idx, { group_ids: ids })}
          />
        ) : (
          <span className="text-[11px]">
            {(act.group_ids || []).length > 0
              ? (act.group_ids || []).map(gid => (groups || []).find(g => g.id === gid)?.libelle).filter(Boolean).join(', ')
              : (act.taille_groupe || 'Promo entière')}
          </span>
        )}
      </td>
      <td className="px-1 py-1">
        {isAdmin ? (
          <FormateurMultiSelect formateurs={formateurs} selected={act.formateur_ids || []} onChange={(ids) => onUpdate(ficheId, idx, { formateur_ids: ids })} />
        ) : (
          <span className="text-[11px]" title={(act.formateur_ids || []).map(id => fmMap[id] && `${fmMap[id].prenom} ${fmMap[id].nom}`).filter(Boolean).join(', ')}>
            {(act.formateur_ids || []).map(id => fmMap[id]?.initiales).filter(Boolean).join(', ')}
          </span>
        )}
      </td>
      <td className="px-1 py-1">
        <Input
          type="number" min="0" step="1"
          className="h-8 w-14 text-xs text-center border border-slate-200 dark:border-slate-700 shadow-none focus-visible:ring-1"
          placeholder="—"
          value={localNbForm}
          onChange={(e) => { setLocalNbForm(e.target.value); clearTimeout(debTimer.current); debTimer.current = setTimeout(() => onUpdate(ficheId, idx, { nb_formateurs: e.target.value === '' ? null : parseInt(e.target.value, 10) || null }), 500); }}
          onBlur={() => { clearTimeout(debTimer.current); onUpdate(ficheId, idx, { nb_formateurs: localNbForm === '' ? null : parseInt(localNbForm, 10) || null }); }}
          disabled={!isAdmin}
          data-testid={`act-nbform-${ficheId}-${idx}`}
        />
      </td>
      <td className="px-2 py-1">
        <Input
          className="h-8 text-xs border-0 shadow-none focus-visible:ring-1"
          placeholder="Remarques..."
          value={localRemarques}
          onChange={(e) => { setLocalRemarques(e.target.value); scheduleUpdate({ remarques: e.target.value }); }}
          onBlur={() => { clearTimeout(debTimer.current); onUpdate(ficheId, idx, { remarques: localRemarques }); }}
          disabled={!isAdmin}
        />
      </td>
      <td className="px-1 py-1 text-right">
        {isAdmin && (
          <button onClick={() => onRemove(ficheId, idx)} className="text-red-400 hover:text-red-600 p-1" data-testid={`remove-act-${ficheId}-${idx}`}>
            <Trash2 size={12} />
          </button>
        )}
      </td>
    </tr>
  );
});

export function FichesProjets() {
  const { isAdmin } = useAuth();
  const [fiches, setFiches] = useState([]);
  const [ues, setUes] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterDomain, setFilterDomain] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all'); // all | a_programmer | programme
  const [domains, setDomains] = useState([]);
  const [collapsed, setCollapsed] = useState({});
  const [allCollapsed, setAllCollapsed] = useState(true);
  const [groups, setGroups] = useState([]);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [cloneForm, setCloneForm] = useState({ source_promotion_id: '', target_promotion_id: '', replace_existing: false });
  const [cloneLoading, setCloneLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filterPromo !== 'all') params.promotion_id = filterPromo;
      if (filterSemestre !== 'all') params.semestre = filterSemestre;
      const [fr, ur, pr, ar, fmr, dr, gr] = await Promise.all([
        API.get('/fiches-projet', { params }),
        API.get('/ues'), API.get('/promotions'),
        API.get('/activity-types'), API.get('/formateurs'),
        API.get('/domains'), API.get('/groups')
      ]);
      setFiches(fr.data); setUes(ur.data); setPromotions(pr.data); setActTypes(ar.data); setFormateurs(fmr.data); setDomains(dr.data); setGroups(gr.data);
    } catch (e) { console.error(e); }
  }, [filterPromo, filterSemestre]);

  useEffect(() => { load(); }, [load]);

  // Auto-collapse all UEs on first load
  useEffect(() => {
    if (allCollapsed && fiches.length > 0) {
      const c = {};
      fiches.forEach(f => { c[f.id] = true; });
      setCollapsed(c);
      setAllCollapsed(false);
    }
  }, [fiches, allCollapsed]);

  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const atMap = Object.fromEntries(actTypes.map(a => [a.id, a]));
  const atByName = Object.fromEntries(actTypes.map(a => [a.nom, a]));
  const weekOptions = buildWeekOptions();

  // Save with debounce per fiche
  const saveFiche = async (fiche) => {
    try {
      await API.put(`/fiches-projet/${fiche.id}`, fiche);
    } catch (e) { console.error('Save failed:', e); }
  };

  const updateActivite = useCallback((ficheId, idx, patch) => {
    setFiches(prev => prev.map(f => {
      if (f.id !== ficheId) return f;
      const acts = [...(f.activites || [])];
      acts[idx] = { ...acts[idx], ...patch };
      const updated = { ...f, activites: acts };
      clearTimeout(window[`__save_${ficheId}`]);
      window[`__save_${ficheId}`] = setTimeout(() => saveFiche(updated), 600);
      return updated;
    }));
  }, []);

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

  const removeActivite = useCallback((ficheId, idx) => {
    setFiches(prev => prev.map(f => {
      if (f.id !== ficheId) return f;
      const acts = [...(f.activites || [])];
      acts.splice(idx, 1);
      const updated = { ...f, activites: acts };
      saveFiche(updated);
      return updated;
    }));
  }, []);

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

  const filteredFiches = fiches.filter(f => {
    const ue = ueMap[f.ue_id];
    if (filterDomain !== 'all' && ue?.domain_id !== filterDomain) return false;
    if (filterStatus !== 'all') {
      const acts = f.activites || [];
      if (filterStatus === 'a_programmer' && !acts.some(a => !a.session_id)) return false;
      if (filterStatus === 'programme' && !acts.some(a => a.session_id)) return false;
    }
    return true;
  });
  const seqWithoutWeek = filteredFiches.reduce((sum, f) => sum + (f.activites || []).filter(a => !a.semaine_souhaitee).length, 0);
  const sortedFiches = [...filteredFiches].sort((a, b) => {
    const ua = ueMap[a.ue_id]?.code_ue || '';
    const ub = ueMap[b.ue_id]?.code_ue || '';
    return ua.localeCompare(ub);
  });

  const toggleAll = (open) => {
    const c = {};
    sortedFiches.forEach(f => { c[f.id] = !open; });
    setCollapsed(c);
  };

  return (
    <div className="space-y-3" data-testid="fiches-projets-tab">
      <Card className="p-4 bg-blue-900 dark:bg-blue-950 text-white border-0">
        <h2 className="text-center text-base font-bold tracking-wider uppercase">Déroulement des séquences de l'UE</h2>
      </Card>
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div className="flex items-end gap-2 flex-wrap">
          <Select value={filterPromo} onValueChange={setFilterPromo}>
            <SelectTrigger className="h-9 w-44 text-sm" data-testid="filter-promo"><SelectValue placeholder="Toutes les promos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les promos</SelectItem>
              {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterSemestre} onValueChange={setFilterSemestre}>
            <SelectTrigger className="h-9 w-36 text-sm"><SelectValue placeholder="Tous semestres" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous semestres</SelectItem>
              {['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterDomain} onValueChange={setFilterDomain}>
            <SelectTrigger className="h-9 w-40 text-sm border-blue-400" data-testid="filter-domain"><SelectValue placeholder="Tous les domaines" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les domaines</SelectItem>
              {domains.map(d => <SelectItem key={d.id} value={d.id}>{d.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-44 text-sm" data-testid="filter-status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="a_programmer">À programmer</SelectItem>
              <SelectItem value="programme">Programmé</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => toggleAll(true)} data-testid="expand-all-fiches">Tout déplier</Button>
          <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => toggleAll(false)} data-testid="collapse-all-fiches">Tout replier</Button>
          {seqWithoutWeek > 0 && (
            <span className="px-3 py-1.5 rounded-md bg-orange-50 dark:bg-orange-950/30 border border-orange-300 text-orange-700 text-xs font-semibold">
              {seqWithoutWeek} séquence{seqWithoutWeek > 1 ? 's' : ''} sans semaine
            </span>
          )}
        </div>
        {isAdmin && (
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={importSessions}><RefreshCw size={14} className="mr-1" />Récup. séances</Button>
            <Button variant="outline" size="sm" onClick={() => setShowCloneDialog(true)}><Copy size={14} className="mr-1" />Cloner</Button>
            <Button variant="outline" size="sm" onClick={importUEs}><Download size={14} className="mr-1" />Importer UE</Button>
          </div>
        )}
      </div>

      {sortedFiches.length === 0 ? (
        <Card className="py-10 text-center text-sm text-slate-500">Aucune fiche projet. Cliquez sur "Importer UE" pour démarrer.</Card>
      ) : sortedFiches.map(fiche => {
        const ue = ueMap[fiche.ue_id];
        const acts = fiche.activites || [];
        const totalH = acts.reduce((s, a) => s + (parseFloat(a.heures) || 0), 0);
        const planned = acts.filter(a => a.session_id).length;
        const noWeek = acts.filter(a => !a.semaine_souhaitee).length;
        const isCollapsed = collapsed[fiche.id];
        return (
          <Card key={fiche.id} className="overflow-hidden" data-testid={`fiche-${fiche.id}`}>
            <div className="bg-blue-900 dark:bg-blue-950 text-white px-4 py-2.5 flex items-center justify-between">
              <button onClick={() => setCollapsed(c => ({ ...c, [fiche.id]: !c[fiche.id] }))} className="flex items-center gap-2 hover:opacity-80" data-testid={`toggle-fiche-${fiche.id}`}>
                {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                <span className="font-bold text-sm">{ue?.code_ue || 'UE ?'} — {ue?.intitule || ''}</span>
                {fiche.semestre && <span className="text-[10px] px-1.5 py-0.5 bg-blue-700 rounded">{fiche.semestre}</span>}
              </button>
              <div className="flex items-center gap-3">
                <span className="text-xs text-blue-200">{acts.length} séquence{acts.length !== 1 ? 's' : ''} · {totalH.toFixed(1)}h{planned > 0 && ` · ${planned}/${acts.length} planifiées`}</span>
                {noWeek > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-400 text-amber-950 font-bold">{noWeek} à programmer</span>}
                {isAdmin && <Button size="sm" variant="ghost" className="h-7 text-xs text-white hover:bg-blue-800" onClick={() => addActivite(fiche.id)} data-testid={`add-line-${fiche.id}`}><Plus size={12} className="mr-1" />Ligne</Button>}
              </div>
            </div>

            {!isCollapsed && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-10">N°</th>
                      <th className="px-2 py-1.5 text-left">Intitulé de la séquence</th>
                      <th className="px-2 py-1.5 text-left w-20">Type</th>
                      <th className="px-2 py-1.5 text-center w-24">Temps (h)</th>
                      <th className="px-2 py-1.5 text-center w-16">Oblig.</th>
                      <th className="px-2 py-1.5 text-left w-44">N° Sem. souhaitée</th>
                      <th className="px-2 py-1.5 text-left w-32">Taille groupe / Groupes</th>
                      <th className="px-2 py-1.5 text-left w-32">Intervenants</th>
                      <th className="px-2 py-1.5 text-center w-14" title="Nombre de formateurs (optionnel)">Nb form.</th>
                      <th className="px-2 py-1.5 text-left">Remarques</th>
                      <th className="px-2 py-1.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {acts.length === 0 && (
                      <tr><td colSpan={11} className="text-center py-4 text-slate-400">Aucune séquence. Cliquez "Ligne" pour ajouter.</td></tr>
                    )}
                    {acts.map((act, idx) => (
                      <ActiviteRow
                        key={`${fiche.id}-${idx}`}
                        ficheId={fiche.id}
                        idx={idx}
                        act={act}
                        isAdmin={isAdmin}
                        atMap={atMap}
                        actTypes={actTypes}
                        formateurs={formateurs}
                        fmMap={fmMap}
                        weekOptions={weekOptions}
                        groups={groups.filter(g => !g.promotion_id || !fiche.promotion_id || g.promotion_id === fiche.promotion_id)}
                        onUpdate={updateActivite}
                        onRemove={removeActivite}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        );
      })}

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

// Multi-select group preset or specific groups
function GroupMultiSelect({ groups, tailleGroupe, selected, onChangeTaille, onChangeGroups }) {
  const [open, setOpen] = useState(false);
  const sel = selected || [];
  const display = sel.length > 0
    ? sel.map(id => groups.find(g => g.id === id)?.libelle).filter(Boolean).join(', ')
    : (tailleGroupe || 'Promo entière');
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full h-8 px-2 text-[11px] text-left rounded hover:bg-slate-100 dark:hover:bg-slate-800 truncate border border-slate-200 dark:border-slate-700"
        title={display}>
        {display || <span className="text-slate-400">Choisir...</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 top-full left-0 mt-1 w-60 max-h-72 overflow-y-auto bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 p-2">
            <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Préréglage</div>
            <Select value={tailleGroupe || 'Promo entière'} onValueChange={(v) => { onChangeTaille(v); if (sel.length > 0) onChangeGroups([]); }}>
              <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
              <SelectContent>{GROUPES_PRESETS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
            </Select>
            {groups.length > 0 && (
              <>
                <div className="text-[10px] font-bold uppercase text-slate-500 mt-2 mb-1">Groupes spécifiques</div>
                {groups.map(g => {
                  const checked = sel.includes(g.id);
                  return (
                    <label key={g.id} className="flex items-center gap-2 px-1 py-1 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={(e) => {
                        onChangeGroups(e.target.checked ? [...sel, g.id] : sel.filter(i => i !== g.id));
                      }} />
                      <span className="truncate">{g.libelle}</span>
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
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
      <button type="button" onClick={() => setOpen(!open)} className="w-full h-8 px-2 text-[11px] text-left rounded hover:bg-slate-100 dark:hover:bg-slate-800 truncate" title={display}>
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

export default function Coordination() {
  return <div className="space-y-4" data-testid="coordination-page"><FichesProjets /></div>;
}
