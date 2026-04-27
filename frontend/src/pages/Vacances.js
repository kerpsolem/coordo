import { useState, useEffect, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Plus, Edit2, Trash2, Plane } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const PRESETS = [
  'Vacances de Toussaint',
  'Vacances de Noel',
  "Vacances d'hiver",
  'Vacances de printemps',
  "Vacances d'ete",
  'Pont',
  'Autre',
];

export default function Vacances() {
  const { isAdmin } = useAuth();
  const [vacances, setVacances] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [filterPromo, setFilterPromo] = useState('all');
  const [editItem, setEditItem] = useState(null);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    try {
      const params = filterPromo !== 'all' ? { promotion_id: filterPromo } : {};
      const [v, p] = await Promise.all([
        API.get('/vacances', { params }),
        API.get('/promotions'),
      ]);
      setVacances(v.data);
      setPromotions(p.data);
    } catch (e) { console.error(e); }
  }, [filterPromo]);

  useEffect(() => { load(); }, [load]);

  const promoMap = Object.fromEntries(promotions.map(p => [p.id, p]));

  const startNew = () => {
    setEditItem({ nom: '', promotion_id: '', date_debut: '', date_fin: '' });
    setShowDialog(true);
  };

  const startEdit = (v) => { setEditItem({ ...v }); setShowDialog(true); };

  const save = async () => {
    if (!editItem.promotion_id || !editItem.date_debut || !editItem.date_fin || !editItem.nom) {
      alert('Tous les champs sont obligatoires.'); return;
    }
    if (editItem.date_fin < editItem.date_debut) {
      alert('Date de fin avant date de debut.'); return;
    }
    try {
      if (editItem.id) await API.put(`/vacances/${editItem.id}`, editItem);
      else await API.post('/vacances', editItem);
      setShowDialog(false); load();
    } catch (e) { console.error(e); alert('Erreur lors de l\'enregistrement'); }
  };

  const del = async (id) => {
    if (!window.confirm('Supprimer cette periode de vacances ?')) return;
    try { await API.delete(`/vacances/${id}`); load(); } catch (e) { console.error(e); }
  };

  // Group by promotion
  const byPromo = vacances.reduce((acc, v) => {
    (acc[v.promotion_id] = acc[v.promotion_id] || []).push(v);
    return acc;
  }, {});

  const dayCount = (d1, d2) => {
    try {
      const diff = (new Date(d2) - new Date(d1)) / (1000 * 60 * 60 * 24);
      return Math.max(0, Math.round(diff) + 1);
    } catch { return 0; }
  };

  return (
    <div className="space-y-4" data-testid="vacances-page">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Plane size={22} className="text-orange-500" />
          <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Vacances scolaires par promotion</h1>
        </div>
        {isAdmin && <Button size="sm" onClick={startNew} data-testid="new-vacance-btn"><Plus size={14} className="mr-1" /> Nouvelle periode</Button>}
      </div>

      <p className="text-xs text-slate-500">
        Definissez les periodes de vacances specifiques a chaque promotion. Elles s'afficheront automatiquement dans le planning global et seront exclues du calcul des heures.
      </p>

      {/* Filter */}
      <div>
        <Label className="text-xs">Filtrer par promotion</Label>
        <Select value={filterPromo} onValueChange={setFilterPromo}>
          <SelectTrigger className="w-60 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes promotions</SelectItem>
            {promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Liste groupée */}
      {Object.keys(byPromo).length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-slate-500">
          Aucune periode de vacances enregistree. Cliquez sur "Nouvelle periode" pour en ajouter.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {Object.entries(byPromo).map(([pid, list]) => {
            const promo = promoMap[pid];
            return (
              <Card key={pid}>
                <div className="px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border-b font-semibold flex items-center justify-between">
                  <span>{promo?.nom || 'Promotion inconnue'}</span>
                  <span className="text-xs text-slate-500">{list.length} periode(s)</span>
                </div>
                <CardContent className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {list.sort((a, b) => (a.date_debut || '').localeCompare(b.date_debut || '')).map(v => (
                    <div key={v.id} className="rounded border border-slate-200 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-800 flex items-center justify-between" data-testid={`vacance-${v.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{v.nom}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {v.date_debut && format(new Date(v.date_debut), 'd MMM', { locale: fr })}
                          {' - '}
                          {v.date_fin && format(new Date(v.date_fin), 'd MMM yyyy', { locale: fr })}
                          {' · '}
                          <span className="text-orange-600 font-semibold">{dayCount(v.date_debut, v.date_fin)}j</span>
                        </div>
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1 ml-2">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(v)}><Edit2 size={12} /></Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => del(v.id)}><Trash2 size={12} /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editItem?.id ? 'Modifier la periode' : 'Nouvelle periode de vacances'}</DialogTitle></DialogHeader>
          {editItem && (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Promotion *</Label>
                <Select value={editItem.promotion_id} onValueChange={v => setEditItem({ ...editItem, promotion_id: v })}>
                  <SelectTrigger className="h-9 text-sm" data-testid="vacance-promo"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Nom *</Label>
                <Select value={PRESETS.includes(editItem.nom) ? editItem.nom : 'Autre'} onValueChange={v => setEditItem({ ...editItem, nom: v === 'Autre' ? (editItem.nom || '') : v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRESETS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="h-9 text-sm mt-2" placeholder="Ou saisir un nom personnalise" value={editItem.nom} onChange={e => setEditItem({ ...editItem, nom: e.target.value })} data-testid="vacance-nom" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="text-xs">Date debut *</Label><Input type="date" className="h-9 text-sm" value={editItem.date_debut} onChange={e => setEditItem({ ...editItem, date_debut: e.target.value })} data-testid="vacance-debut" /></div>
                <div><Label className="text-xs">Date fin *</Label><Input type="date" className="h-9 text-sm" value={editItem.date_fin} onChange={e => setEditItem({ ...editItem, date_fin: e.target.value })} data-testid="vacance-fin" /></div>
              </div>
              {editItem.date_debut && editItem.date_fin && editItem.date_fin >= editItem.date_debut && (
                <p className="text-xs text-orange-600 font-medium">{dayCount(editItem.date_debut, editItem.date_fin)} jour(s) au total</p>
              )}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setShowDialog(false)}>Annuler</Button>
                <Button size="sm" onClick={save} data-testid="vacance-save">Enregistrer</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
