import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit2, Trash2, Copy, FileDown } from 'lucide-react';

export default function AttributionCopies() {
  const { isAdmin } = useAuth();
  const [attributions, setAttributions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [ues, setUes] = useState([]);
  const [filterFormateur, setFilterFormateur] = useState('all');
  const [filterPromo, setFilterPromo] = useState('all');
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [editItem, setEditItem] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    const params = {};
    if (filterFormateur !== 'all') params.formateur_id = filterFormateur;
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
  }, [filterFormateur, filterPromo, filterSemestre]);

  useEffect(() => { load(); }, [load]);

  const fmMap = Object.fromEntries(formateurs.map(f => [f.id, f]));
  const prMap = Object.fromEntries(promotions.map(p => [p.id, p]));
  const ueMap = Object.fromEntries(ues.map(u => [u.id, u]));

  const startNew = () => {
    setEditItem({ formateur_id: '', promotion_id: '', semestre: '', ue_id: '', type_evaluation: 'Ecrit', nombre_copies: 0, volume_horaire: 0, commentaire: '' });
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

  const duplicate = async (id) => {
    try { await API.post(`/copy-attributions/${id}/duplicate`); load(); } catch (e) { console.error(e); }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer ?')) return;
    try { await API.delete(`/copy-attributions/${id}`); load(); } catch (e) { console.error(e); }
  };

  // Group by formateur
  const byFormateur = {};
  attributions.forEach(a => {
    const fm = fmMap[a.formateur_id];
    const key = a.formateur_id;
    if (!byFormateur[key]) byFormateur[key] = { formateur: fm, items: [], totalCopies: 0, totalHeures: 0 };
    byFormateur[key].items.push(a);
    byFormateur[key].totalCopies += a.nombre_copies || 0;
    byFormateur[key].totalHeures += a.volume_horaire || 0;
  });

  const totalCopies = attributions.reduce((s, a) => s + (a.nombre_copies || 0), 0);
  const totalHeures = attributions.reduce((s, a) => s + (a.volume_horaire || 0), 0);

  return (
    <div className="space-y-4" data-testid="attribution-copies">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Attribution des copies</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()}><FileDown size={14} className="mr-1" />Export PDF</Button>
          {isAdmin && <Button size="sm" onClick={startNew} data-testid="new-attribution"><Plus size={14} className="mr-1" />Nouvelle attribution</Button>}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={filterFormateur} onValueChange={setFilterFormateur}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Formateur" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous formateurs</SelectItem>
            {formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Promotion" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            <SelectItem value="pair">Pairs</SelectItem>
            <SelectItem value="impair">Impairs</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="py-3"><p className="text-xl font-bold">{totalCopies}</p><p className="text-xs text-slate-500">Total copies</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xl font-bold">{totalHeures.toFixed(1)}h</p><p className="text-xs text-slate-500">Volume horaire</p></CardContent></Card>
        <Card><CardContent className="py-3"><p className="text-xl font-bold">{Object.keys(byFormateur).length}</p><p className="text-xs text-slate-500">Formateurs concernes</p></CardContent></Card>
      </div>

      {/* By Formateur */}
      <div className="space-y-3">
        {Object.entries(byFormateur).map(([fid, data]) => (
          <Card key={fid} className="overflow-hidden">
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{data.formateur?.initiales}</span>
                <span className="text-sm">{data.formateur?.prenom} {data.formateur?.nom}</span>
              </div>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{data.totalCopies} copies</span>
                <span>{data.totalHeures.toFixed(1)}h</span>
              </div>
            </div>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Semestre</TableHead>
                    <TableHead className="text-xs">Promotion</TableHead>
                    <TableHead className="text-xs">UE</TableHead>
                    <TableHead className="text-xs">Type eval.</TableHead>
                    <TableHead className="text-xs">Copies</TableHead>
                    <TableHead className="text-xs">Heures</TableHead>
                    {isAdmin && <TableHead className="text-xs">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map(a => (
                    <TableRow key={a.id} className="text-xs">
                      <TableCell className="py-1.5">{a.semestre}</TableCell>
                      <TableCell className="py-1.5">{prMap[a.promotion_id]?.nom?.replace('Promotion ', '')}</TableCell>
                      <TableCell className="py-1.5">{ueMap[a.ue_id]?.code_ue} - {ueMap[a.ue_id]?.intitule}</TableCell>
                      <TableCell className="py-1.5">{a.type_evaluation}</TableCell>
                      <TableCell className="py-1.5 font-semibold">{a.nombre_copies}</TableCell>
                      <TableCell className="py-1.5">{a.volume_horaire}h</TableCell>
                      {isAdmin && (
                        <TableCell className="py-1.5">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => startEdit(a)}><Edit2 size={10} /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => duplicate(a.id)}><Copy size={10} /></Button>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500" onClick={() => del(a.id)}><Trash2 size={10} /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      {attributions.length === 0 && <p className="text-center py-8 text-sm text-slate-500">Aucune attribution de copies</p>}

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem?.id ? 'Modifier' : 'Nouvelle attribution'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Formateur</Label>
                <Select value={editItem.formateur_id || ''} onValueChange={v => setEditItem({ ...editItem, formateur_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Promotion</Label>
                <Select value={editItem.promotion_id || ''} onValueChange={v => setEditItem({ ...editItem, promotion_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Semestre</Label>
                <Select value={editItem.semestre || ''} onValueChange={v => setEditItem({ ...editItem, semestre: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>UE</Label>
                <Select value={editItem.ue_id || ''} onValueChange={v => setEditItem({ ...editItem, ue_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u => <SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type evaluation</Label>
                <Select value={editItem.type_evaluation || ''} onValueChange={v => setEditItem({ ...editItem, type_evaluation: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ecrit">Ecrit</SelectItem>
                    <SelectItem value="Oral">Oral</SelectItem>
                    <SelectItem value="Pratique">Pratique</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Nombre de copies</Label><Input type="number" value={editItem.nombre_copies || 0} onChange={e => setEditItem({ ...editItem, nombre_copies: Number(e.target.value) })} /></div>
              <div><Label>Volume horaire</Label><Input type="number" step="0.5" value={editItem.volume_horaire || 0} onChange={e => setEditItem({ ...editItem, volume_horaire: Number(e.target.value) })} /></div>
              <div><Label>Commentaire</Label><Input value={editItem.commentaire || ''} onChange={e => setEditItem({ ...editItem, commentaire: e.target.value })} /></div>
              <div className="col-span-2 flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button onClick={save}>Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
