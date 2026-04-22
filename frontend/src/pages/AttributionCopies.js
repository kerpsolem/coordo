import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../components/ui/collapsible';
import { Plus, Edit2, Trash2, Copy, ChevronDown, ChevronRight, User } from 'lucide-react';

export default function AttributionCopies() {
  const { isAdmin } = useAuth();
  const [attributions, setAttributions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [ues, setUes] = useState([]);
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [openFormateurs, setOpenFormateurs] = useState(new Set());
  const [editItem, setEditItem] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    const params = {};
    if (filterPromo !== 'all') params.promotion_id = filterPromo;
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    try {
      const [attrRes, fmRes, prRes, ueRes] = await Promise.all([
        API.get('/copy-attributions', { params }), API.get('/formateurs'),
        API.get('/promotions'), API.get('/ues')
      ]);
      setAttributions(attrRes.data); setFormateurs(fmRes.data);
      setPromotions(prRes.data); setUes(ueRes.data);
    } catch (e) { console.error(e); }
  }, [filterPromo, filterSemestre]);

  useEffect(() => { load(); }, [load]);

  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const prMap = Object.fromEntries(promotions.map(p => [p.id, p]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));

  const startNew = (formateurId) => {
    setEditItem({ formateur_id: formateurId || '', promotion_id: '', semestre: '', ue_id: '', type_evaluation: 'Ecrit', nombre_copies: 0, volume_horaire: 0, commentaire: '' });
    setShowDialog(true);
  };
  const startEdit = (item) => { setEditItem({ ...item }); setShowDialog(true); };
  const save = async () => {
    try {
      if (editItem.id) await API.put(`/copy-attributions/${editItem.id}`, editItem);
      else await API.post('/copy-attributions', editItem);
      setShowDialog(false); load();
    } catch (e) { console.error(e); }
  };
  const duplicate = async (id) => { try { await API.post(`/copy-attributions/${id}/duplicate`); load(); } catch (e) { console.error(e); } };
  const del = async (id) => { if (!window.confirm('Supprimer ?')) return; try { await API.delete(`/copy-attributions/${id}`); load(); } catch (e) { console.error(e); } };

  const toggleFormateur = (fid) => {
    const next = new Set(openFormateurs);
    if (next.has(fid)) next.delete(fid); else next.add(fid);
    setOpenFormateurs(next);
  };

  // Group by formateur
  const byFormateur = {};
  attributions.forEach(a => {
    const key = a.formateur_id;
    const minParCopie = a.minutes_par_copie || a.volume_horaire || 0;
    const copies = a.nombre_copies || 0;
    const totalMin = minParCopie * copies;
    if (!byFormateur[key]) byFormateur[key] = { items: [], totalCopies: 0, totalMinutes: 0 };
    byFormateur[key].items.push(a);
    byFormateur[key].totalCopies += copies;
    byFormateur[key].totalMinutes += totalMin;
  });

  const totalCopies = attributions.reduce((s, a) => s + (a.nombre_copies || 0), 0);
  const totalMinutes = attributions.reduce((s, a) => s + (a.minutes_par_copie || a.volume_horaire || 0) * (a.nombre_copies || 0), 0);
  const fmtTime = (min) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, '0') : ''}` : `${m}min`; };

  // Sort formateurs by name, only those with attributions or all
  const sortedFormateurs = formateurs
    .filter(f => byFormateur[f.id])
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return (
    <div className="space-y-4" data-testid="attribution-copies">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Attribution des copies</h1>
        <div className="flex gap-2">
          {isAdmin && <Button size="sm" onClick={() => startNew()} data-testid="new-attribution"><Plus size={14} className="mr-1" />Nouvelle attribution</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpenFormateurs(new Set(sortedFormateurs.map(f => f.id)))}>Tout ouvrir</Button>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpenFormateurs(new Set())}>Tout fermer</Button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="py-3"><p className="text-xl font-bold" style={{ fontFamily: 'Outfit' }}>{totalCopies}</p><p className="text-xs text-slate-500">Total copies</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xl font-bold" style={{ fontFamily: 'Outfit' }}>{fmtTime(totalMinutes)}</p><p className="text-xs text-slate-500">Volume horaire total</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xl font-bold" style={{ fontFamily: 'Outfit' }}>{sortedFormateurs.length}</p><p className="text-xs text-slate-500">Formateurs concernes</p></CardContent></Card>
      </div>

      {/* List by formateur - collapsible */}
      <div className="space-y-1">
        {sortedFormateurs.map(f => {
          const data = byFormateur[f.id];
          const isOpen = openFormateurs.has(f.id);
          return (
            <div key={f.id} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              {/* Formateur header - always visible */}
              <button
                onClick={() => toggleFormateur(f.id)}
                className="w-full flex items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                data-testid={`toggle-formateur-${f.id}`}
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                  <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold">{f.initiales}</div>
                  <span className="text-sm font-medium">{f.prenom} {f.nom}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span>{data.items.length} attribution{data.items.length > 1 ? 's' : ''}</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">{data.totalCopies} copies</span>
                  <span>{fmtTime(data.totalMinutes)}</span>
                  {isAdmin && (
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px]"
                      onClick={(e) => { e.stopPropagation(); startNew(f.id); }}>
                      <Plus size={10} className="mr-1" />Ajouter
                    </Button>
                  )}
                </div>
              </button>

              {/* Collapsible detail */}
              {isOpen && (
                <div className="border-t border-slate-200 dark:border-slate-800">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] py-1.5">Sem.</TableHead>
                        <TableHead className="text-[10px] py-1.5">Promotion</TableHead>
                        <TableHead className="text-[10px] py-1.5">UE</TableHead>
                        <TableHead className="text-[10px] py-1.5">Type</TableHead>
                        <TableHead className="text-[10px] py-1.5 text-right">Copies</TableHead>
                        <TableHead className="text-[10px] py-1.5 text-right">Min/copie</TableHead>
                        <TableHead className="text-[10px] py-1.5 text-right">Total</TableHead>
                        {isAdmin && <TableHead className="text-[10px] py-1.5 w-20">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.items.map(a => (
                        <TableRow key={a.id} className="text-xs">
                          <TableCell className="py-1">{a.semestre}</TableCell>
                          <TableCell className="py-1">{prMap[a.promotion_id]?.nom?.replace('Promotion ', '')}</TableCell>
                          <TableCell className="py-1">{ueMap[a.ue_id]?.code_ue} - {ueMap[a.ue_id]?.intitule}</TableCell>
                          <TableCell className="py-1">{a.type_evaluation}</TableCell>
                          <TableCell className="py-1 text-right font-semibold">{a.nombre_copies}</TableCell>
                          <TableCell className="py-1 text-right">{a.minutes_par_copie || a.volume_horaire || 0} min</TableCell>
                          <TableCell className="py-1 text-right font-medium">{fmtTime((a.minutes_par_copie || a.volume_horaire || 0) * (a.nombre_copies || 0))}</TableCell>
                          {isAdmin && (
                            <TableCell className="py-1">
                              <div className="flex gap-0.5">
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => startEdit(a)}><Edit2 size={10} /></Button>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => duplicate(a.id)}><Copy size={10} /></Button>
                                <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500" onClick={() => del(a.id)}><Trash2 size={10} /></Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {attributions.length === 0 && <p className="text-center py-8 text-sm text-slate-500">Aucune attribution de copies</p>}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?.id ? 'Modifier' : 'Nouvelle attribution'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Formateur</Label>
                <Select value={editItem.formateur_id || ''} onValueChange={v => setEditItem({ ...editItem, formateur_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Promotion</Label>
                <Select value={editItem.promotion_id || ''} onValueChange={v => setEditItem({ ...editItem, promotion_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Semestre</Label>
                <Select value={editItem.semestre || ''} onValueChange={v => setEditItem({ ...editItem, semestre: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">UE</Label>
                <Select value={editItem.ue_id || ''} onValueChange={v => setEditItem({ ...editItem, ue_id: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Type evaluation</Label>
                <Select value={editItem.type_evaluation || 'Ecrit'} onValueChange={v => setEditItem({ ...editItem, type_evaluation: v })}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ecrit">Ecrit</SelectItem>
                    <SelectItem value="Oral">Oral</SelectItem>
                    <SelectItem value="Pratique">Pratique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Nombre de copies</Label><Input type="number" className="h-8 text-sm" value={editItem.nombre_copies || 0} onChange={e => setEditItem({ ...editItem, nombre_copies: Number(e.target.value) })} /></div>
              <div>
                <Label className="text-xs">Minutes par copie</Label>
                <Input type="number" step="1" className="h-8 text-sm" value={editItem.minutes_par_copie || editItem.volume_horaire || 0} onChange={e => setEditItem({ ...editItem, minutes_par_copie: Number(e.target.value) })} />
                {editItem.nombre_copies > 0 && (editItem.minutes_par_copie || editItem.volume_horaire || 0) > 0 && (
                  <p className="text-[10px] text-slate-500 mt-0.5">= {fmtTime((editItem.minutes_par_copie || editItem.volume_horaire || 0) * editItem.nombre_copies)} pour {editItem.nombre_copies} copies</p>
                )}
              </div>
              <div><Label className="text-xs">Commentaire</Label><Input className="h-8 text-sm" value={editItem.commentaire || ''} onChange={e => setEditItem({ ...editItem, commentaire: e.target.value })} /></div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button size="sm" onClick={save} data-testid="save-attribution">Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
