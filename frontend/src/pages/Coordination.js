import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit2, Trash2, GripVertical, Layers, ArrowUp, ArrowDown, Download } from 'lucide-react';

const TAILLES = [
  { value: 'promo_entiere', label: 'Promotion entiere' },
  { value: 'demi_promo', label: '1/2 promotion' },
  { value: 'quart_promo', label: '1/4 promotion' },
];

export default function Coordination() {
  const { isAdmin } = useAuth();
  const [fiches, setFiches] = useState([]);
  const [ues, setUes] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [filterUe, setFilterUe] = useState('all');
  const [filterPromo, setFilterPromo] = useState('all');
  const [editFiche, setEditFiche] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filterSemestre !== 'all') params.semestre = filterSemestre;
      if (filterUe !== 'all') params.ue_id = filterUe;
      if (filterPromo !== 'all') params.promotion_id = filterPromo;
      const [fr, ur, pr, ar] = await Promise.all([
        API.get('/fiches-projet', { params }),
        API.get('/ues'), API.get('/promotions'), API.get('/activity-types')
      ]);
      setFiches(fr.data); setUes(ur.data); setPromotions(pr.data); setActTypes(ar.data);
    } catch (e) { console.error(e); }
  }, [filterSemestre, filterUe, filterPromo]);

  useEffect(() => { load(); }, [load]);

  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));
  const promoMap = Object.fromEntries(promotions.map(p => [p.id, p]));

  const startNew = () => {
    setEditFiche({
      ue_id: '', semestre: '', promotion_id: '',
      activites: []
    });
    setShowDialog(true);
  };

  const startEdit = (f) => {
    setEditFiche(JSON.parse(JSON.stringify(f)));
    setShowDialog(true);
  };

  const save = async () => {
    try {
      // Reorder activites by ordre
      const acts = (editFiche.activites || []).map((a, i) => ({ ...a, ordre: a.ordre ?? i }));
      const payload = { ...editFiche, activites: acts };
      if (editFiche.id) await API.put(`/fiches-projet/${editFiche.id}`, payload);
      else await API.post('/fiches-projet', payload);
      setShowDialog(false); load();
    } catch (e) { console.error(e); alert('Erreur lors de l\'enregistrement'); }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer cette fiche projet ?')) return;
    try { await API.delete(`/fiches-projet/${id}`); load(); } catch (e) { console.error(e); }
  };

  const importUEs = async () => {
    if (!window.confirm('Creer automatiquement une fiche projet vide pour chaque UE qui n\'en a pas encore ?')) return;
    try {
      const { data } = await API.post('/fiches-projet/import-ues');
      alert(`Import termine : ${data.created} fiche(s) cree(s), ${data.skipped} deja existante(s).`);
      load();
    } catch (e) { console.error(e); alert('Erreur lors de l\'import'); }
  };

  const addActivite = () => {
    const next = (editFiche.activites || []).length;
    setEditFiche({
      ...editFiche,
      activites: [...(editFiche.activites || []), { nom: '', heures: 2, promotion_id: editFiche.promotion_id || '', taille_groupe: 'promo_entiere', ordre: next, type_activite_id: '' }]
    });
  };

  const updateActivite = (idx, patch) => {
    const acts = [...(editFiche.activites || [])];
    acts[idx] = { ...acts[idx], ...patch };
    setEditFiche({ ...editFiche, activites: acts });
  };

  const removeActivite = (idx) => {
    const acts = [...(editFiche.activites || [])];
    acts.splice(idx, 1);
    setEditFiche({ ...editFiche, activites: acts });
  };

  const moveActivite = (idx, dir) => {
    const acts = [...(editFiche.activites || [])];
    const target = idx + dir;
    if (target < 0 || target >= acts.length) return;
    [acts[idx], acts[target]] = [acts[target], acts[idx]];
    acts.forEach((a, i) => { a.ordre = i; });
    setEditFiche({ ...editFiche, activites: acts });
  };

  // Group fiches by UE
  const fichesByUE = fiches.reduce((acc, f) => { (acc[f.ue_id] = acc[f.ue_id] || []).push(f); return acc; }, {});

  return (
    <div className="space-y-4" data-testid="coordination-page">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Coordination · Fiches projet</h1>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={importUEs} data-testid="import-ues-btn"><Download size={14} className="mr-1" /> Importer toutes les UE</Button>
            <Button size="sm" onClick={startNew} data-testid="new-fiche-btn"><Plus size={14} className="mr-1" /> Nouvelle fiche</Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <Label className="text-xs">Semestre</Label>
          <Select value={filterSemestre} onValueChange={setFilterSemestre}>
            <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              {['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">UE</Label>
          <Select value={filterUe} onValueChange={setFilterUe}>
            <SelectTrigger className="w-60 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Promotion</Label>
          <Select value={filterPromo} onValueChange={setFilterPromo}>
            <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes</SelectItem>
              {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste groupée par UE */}
      {Object.keys(fichesByUE).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-slate-500">Aucune fiche projet. Cliquez sur "Nouvelle fiche" pour commencer.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(fichesByUE).map(([ueId, list]) => {
            const ue = ueMap[ueId] || {};
            return (
              <div key={ueId}>
                <div className="flex items-center gap-2 mb-2">
                  <Layers size={14} className="text-violet-600" />
                  <h3 className="text-sm font-semibold">{ue.code_ue || 'UE inconnue'} · {ue.intitule || ''}</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {list.map(f => {
                    const totalH = (f.activites || []).reduce((s, a) => s + (a.heures || 0), 0);
                    const placed = (f.activites || []).filter(a => a.session_id).length;
                    const total = (f.activites || []).length;
                    const promo = promoMap[f.promotion_id];
                    return (
                      <Card key={f.id} className="hover:shadow-md transition-shadow" data-testid={`fiche-${f.id}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="text-xs text-slate-500">{f.semestre} {promo ? `· ${promo.nom}` : ''}</div>
                              <div className="text-sm font-semibold mt-0.5">{total} activite(s) · {totalH}h</div>
                            </div>
                            {isAdmin && (
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(f)} title="Modifier"><Edit2 size={12} /></Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => del(f.id)} title="Supprimer"><Trash2 size={12} /></Button>
                              </div>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mb-2">Programme: <span className="font-bold text-violet-700">{placed}/{total}</span></div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {(f.activites || []).sort((a,b) => (a.ordre||0)-(b.ordre||0)).map((a, i) => (
                              <div key={a.id || i} className={`text-[11px] px-2 py-1 rounded border ${a.session_id ? 'bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-900' : 'bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900'}`}>
                                <div className="flex items-center justify-between">
                                  <span className="font-medium truncate">{a.ordre + 1}. {a.nom || '(sans nom)'}</span>
                                  <span className="text-slate-500">{a.heures}h</span>
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">{(a.taille_groupe || 'promo_entiere').replace('_', ' ')} {a.session_id ? '· programme' : '· a programmer'}</div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editFiche?.id ? 'Modifier la fiche projet' : 'Nouvelle fiche projet'}</DialogTitle></DialogHeader>
          {editFiche && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">UE *</Label>
                  <Select value={editFiche.ue_id || ''} onValueChange={v => setEditFiche({ ...editFiche, ue_id: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Semestre *</Label>
                  <Select value={editFiche.semestre || ''} onValueChange={v => setEditFiche({ ...editFiche, semestre: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>{['S1','S2','S3','S4','S5','S6'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Promotion (defaut)</Label>
                  <Select value={editFiche.promotion_id || ''} onValueChange={v => setEditFiche({ ...editFiche, promotion_id: v })}>
                    <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                    <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border-t pt-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold">Activites / Cours ({(editFiche.activites || []).length})</h4>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addActivite} data-testid="add-activite"><Plus size={12} className="mr-1" /> Ajouter</Button>
                </div>
                <div className="space-y-2">
                  {(editFiche.activites || []).map((a, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center p-2 rounded border border-slate-200 dark:border-slate-700">
                      <div className="col-span-1 flex flex-col items-center text-slate-400">
                        <button type="button" onClick={() => moveActivite(idx, -1)} disabled={idx === 0} className="disabled:opacity-30"><ArrowUp size={12} /></button>
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                        <button type="button" onClick={() => moveActivite(idx, 1)} disabled={idx === (editFiche.activites.length - 1)} className="disabled:opacity-30"><ArrowDown size={12} /></button>
                      </div>
                      <div className="col-span-4">
                        <Input className="h-8 text-sm" placeholder="Nom de la seance" value={a.nom || ''} onChange={e => updateActivite(idx, { nom: e.target.value })} />
                      </div>
                      <div className="col-span-1">
                        <Input className="h-8 text-sm" type="number" min="0" step="0.5" placeholder="h" value={a.heures || ''} onChange={e => updateActivite(idx, { heures: parseFloat(e.target.value) || 0 })} />
                      </div>
                      <div className="col-span-3">
                        <Select value={a.promotion_id || ''} onValueChange={v => updateActivite(idx, { promotion_id: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Promo" /></SelectTrigger>
                          <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-2">
                        <Select value={a.taille_groupe || 'promo_entiere'} onValueChange={v => updateActivite(idx, { taille_groupe: v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{TAILLES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeActivite(idx)}><Trash2 size={12} /></Button>
                      </div>
                    </div>
                  ))}
                  {(editFiche.activites || []).length === 0 && (
                    <p className="text-center text-xs text-slate-500 py-3">Aucune activite. Cliquez sur "Ajouter" pour en creer une.</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button size="sm" onClick={save} data-testid="save-fiche">Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
