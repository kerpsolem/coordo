import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import API from '../lib/api';
import Layout from '../components/Layout';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, ChevronRight, ChevronDown, Archive, ArchiveRestore, Trash2, Edit3, Layers as LayersIcon, Filter } from 'lucide-react';

const STATUTS = ['À faire', 'En cours', 'Terminé'];
const STATUT_COLORS = {
  'À faire': 'bg-slate-400',
  'En cours': 'bg-coral-500',
  'Terminé': 'bg-emerald-500',
};

// Generate weeks (Monday) between two dates
function generateWeeks(from, to) {
  const out = [];
  const cur = new Date(from);
  const day = (cur.getDay() + 6) % 7;
  cur.setDate(cur.getDate() - day);
  while (cur <= to) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return out;
}

function isoWeek(d) {
  const date = new Date(d.valueOf());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day + 3);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function parseDate(s) {
  if (!s) return null;
  return new Date(s + 'T00:00:00');
}

export default function Tice() {
  const { isTice } = useAuth();
  const [projets, setProjets] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [expandedParents, setExpandedParents] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const load = useCallback(async () => {
    try {
      const [pr, fm] = await Promise.all([
        API.get('/tice/projets'),
        API.get('/formateurs'),
      ]);
      setProjets(pr.data);
      setFormateurs(fm.data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (isTice) load(); }, [isTice, load]);

  // --- Date range for Gantt: 4 months around viewMonth ---
  const ganttFrom = useMemo(() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() - 1); d.setDate(1); return d; }, [viewMonth]);
  const ganttTo = useMemo(() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 3); d.setDate(0); return d; }, [viewMonth]);
  const weeks = useMemo(() => generateWeeks(ganttFrom, ganttTo), [ganttFrom, ganttTo]);
  const WEEK_W = 56;
  const TOTAL_W = weeks.length * WEEK_W;
  const ganttFromMs = weeks[0]?.getTime();

  // Filter
  const filtered = useMemo(() => {
    let list = projets.filter(p => p.archive === showArchived);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.titre || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    if (filterDateFrom) {
      list = list.filter(p => (p.date_fin || '9999') >= filterDateFrom);
    }
    if (filterDateTo) {
      list = list.filter(p => (p.date_debut || '0000') <= filterDateTo);
    }
    return list;
  }, [projets, showArchived, search, filterDateFrom, filterDateTo]);

  // --- Drag/resize logic ---
  const dragRef = useRef(null);
  const progressRef = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      const daysDelta = Math.round(dx / (WEEK_W / 7));
      const next = { ...d.snapshot };
      if (d.mode === 'move') {
        next.date_debut = fmtDate(new Date(d.origDebut.getTime() + daysDelta * 86400000));
        next.date_fin = fmtDate(new Date(d.origFin.getTime() + daysDelta * 86400000));
      } else if (d.mode === 'resize-right') {
        const newFin = new Date(d.origFin.getTime() + daysDelta * 86400000);
        if (newFin >= d.origDebut) next.date_fin = fmtDate(newFin);
      }
      setProjets(ps => ps.map(p => p.id === next.id ? next : p));
    };
    const onUp = async () => {
      const d = dragRef.current;
      if (!d) return;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      dragRef.current = null;
      const cur = (await new Promise(res => setProjets(ps => { res(ps); return ps; })));
      const updated = cur.find(p => p.id === d.id);
      if (updated) {
        try { await API.put(`/tice/projets/${updated.id}`, updated); } catch (e) { console.error(e); load(); }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [load]);

  useEffect(() => {
    const onMove = (e) => {
      const d = progressRef.current;
      if (!d) return;
      const pct = Math.max(0, Math.min(100, ((e.clientX - d.rect.left) / d.rect.width) * 100));
      setProjets(ps => ps.map(p => p.id === d.id ? { ...p, progression: Math.round(pct) } : p));
    };
    const onUp = async () => {
      const d = progressRef.current;
      if (!d) return;
      progressRef.current = null;
      const cur = (await new Promise(res => setProjets(ps => { res(ps); return ps; })));
      const updated = cur.find(p => p.id === d.id);
      if (updated) try { await API.put(`/tice/projets/${updated.id}`, updated); } catch (e) { load(); }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [load]);

  if (!isTice) {
    return <Layout><div className="p-8 text-center text-slate-500">Accès réservé aux administrateurs et formateurs TICE.</div></Layout>;
  }

  // Organize by parent
  const roots = filtered.filter(p => !p.parent_id);
  const childrenOf = (pid) => filtered.filter(p => p.parent_id === pid);

  // --- Create / Edit ---
  const startCreate = (parent_id = null) => {
    setEditing({
      titre: '', description: '', date_debut: fmtDate(new Date()), date_fin: fmtDate(new Date(Date.now() + 14 * 86400000)),
      statut: 'À faire', progression: 0, formateur_demandeur_id: '', formateur_tice_id: '',
      semaine_identifiee: '', parent_id, archive: false,
    });
    setDialogOpen(true);
  };
  const startEdit = (p) => { setEditing({ ...p }); setDialogOpen(true); };
  const save = async () => {
    if (!editing.titre?.trim()) return;
    try {
      if (editing.id) {
        await API.put(`/tice/projets/${editing.id}`, editing);
      } else {
        await API.post('/tice/projets', editing);
      }
      setDialogOpen(false); setEditing(null); load();
    } catch (e) { alert(e.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Supprimer ce projet et ses sous-projets ?')) return;
    await API.delete(`/tice/projets/${id}`); load();
  };
  const toggleArchive = async (p) => {
    await API.put(`/tice/projets/${p.id}`, { ...p, archive: !p.archive });
    load();
  };

  // --- Drag/resize handlers below ---
  const onBarMouseDown = (e, p, mode) => {
    e.preventDefault(); e.stopPropagation();
    const debut = parseDate(p.date_debut);
    const fin = parseDate(p.date_fin);
    if (!debut || !fin) return;
    dragRef.current = { id: p.id, mode, startX: e.clientX, origDebut: debut, origFin: fin, snapshot: { ...p } };
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const onProgressMouseDown = (e, p) => {
    e.preventDefault(); e.stopPropagation();
    const bar = e.currentTarget.parentElement;
    const rect = bar.getBoundingClientRect();
    progressRef.current = { id: p.id, rect, snapshot: { ...p } };
  };

  // --- Render ---
  const renderBar = (p) => {
    const debut = parseDate(p.date_debut);
    const fin = parseDate(p.date_fin);
    if (!debut || !fin || !ganttFromMs) return null;
    const leftDays = (debut.getTime() - ganttFromMs) / 86400000;
    const widthDays = Math.max(1, (fin.getTime() - debut.getTime()) / 86400000 + 1);
    const left = (leftDays * WEEK_W) / 7;
    const width = (widthDays * WEEK_W) / 7;
    const color = STATUT_COLORS[p.statut] || 'bg-slate-400';
    const isChild = !!p.parent_id;
    return (
      <div className="absolute top-1.5" style={{ left: `${left}px`, width: `${width}px`, height: '28px' }}>
        <div
          className={`relative h-full rounded ${color} ${isChild ? 'opacity-80' : 'shadow-sm'} cursor-grab hover:brightness-110 group`}
          onMouseDown={(e) => onBarMouseDown(e, p, 'move')}
          onDoubleClick={() => startEdit(p)}
          title={`${p.titre} • ${p.date_debut} → ${p.date_fin} • ${p.progression}%`}
          data-testid={`gantt-bar-${p.id}`}
        >
          {/* Progress fill */}
          <div className="absolute inset-y-0 left-0 bg-black/20 rounded-l" style={{ width: `${p.progression || 0}%` }} />
          {/* Progress drag handle */}
          <div className="absolute top-0 bottom-0 cursor-ew-resize" style={{ left: `calc(${p.progression || 0}% - 4px)`, width: '8px' }}
            onMouseDown={(e) => onProgressMouseDown(e, p)} title="Tirer pour ajuster la progression" />
          {/* Title */}
          <div className="absolute inset-0 flex items-center px-2 text-[11px] text-white font-semibold truncate pointer-events-none">
            {p.titre} <span className="ml-1.5 opacity-80 text-[10px]">{p.progression || 0}%</span>
          </div>
          {/* Right resize handle */}
          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
            onMouseDown={(e) => onBarMouseDown(e, p, 'resize-right')} title="Tirer pour allonger" />
        </div>
      </div>
    );
  };

  const renderRow = (p, depth = 0) => {
    const subs = childrenOf(p.id);
    const isOpen = expandedParents[p.id] ?? true;
    return (
      <React.Fragment key={p.id}>
        <div className="flex border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40" style={{ minHeight: '40px' }}>
          {/* Left: title + actions */}
          <div className="flex-shrink-0 w-[360px] border-r border-slate-200 dark:border-slate-700 px-2 py-1.5 flex items-center gap-1.5" style={{ paddingLeft: `${10 + depth * 16}px` }}>
            {subs.length > 0 ? (
              <button onClick={() => setExpandedParents(e => ({ ...e, [p.id]: !isOpen }))} className="w-4 text-slate-400 hover:text-slate-700">
                {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span className="w-4" />}
            <span className={`text-xs font-semibold truncate flex-1 ${p.archive ? 'line-through text-slate-400' : ''}`} title={p.titre}>{p.titre}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded text-white ${STATUT_COLORS[p.statut] || 'bg-slate-400'} flex-shrink-0`}>{p.statut}</span>
            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 hover:opacity-100" >
              <button onClick={() => startCreate(p.id)} className="text-slate-400 hover:text-coral-500 p-0.5" title="Ajouter sous-projet"><Plus size={12} /></button>
              <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-blue-500 p-0.5" title="Modifier"><Edit3 size={12} /></button>
              <button onClick={() => toggleArchive(p)} className="text-slate-400 hover:text-amber-500 p-0.5" title={p.archive ? 'Désarchiver' : 'Archiver'}>
                {p.archive ? <ArchiveRestore size={12} /> : <Archive size={12} />}
              </button>
              <button onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-500 p-0.5" title="Supprimer"><Trash2 size={12} /></button>
            </div>
          </div>
          {/* Right: gantt area */}
          <div className="relative flex-1 overflow-hidden" style={{ minWidth: `${TOTAL_W}px` }}>
            {renderBar(p)}
          </div>
        </div>
        {isOpen && subs.map(s => renderRow(s, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <Layout>
      <div className="space-y-3" data-testid="tice-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><LayersIcon size={22} className="text-coral-500" /> Cellule TICE</h1>
            <p className="text-xs text-slate-500">Suivi des projets numériques en diagramme de Gantt</p>
          </div>
          <Button onClick={() => startCreate(null)} data-testid="tice-new-project" className="bg-coral-500 hover:bg-coral-600 text-white">
            <Plus size={16} className="mr-1" /> Nouveau projet
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-2.5 px-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5"><Filter size={14} className="text-slate-400" /><span className="text-xs font-medium text-slate-500">Filtres :</span></div>
            <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="w-48 h-8 text-xs" data-testid="tice-search" />
            <div className="flex items-center gap-1 text-xs">Du <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-8 w-36 text-xs" /></div>
            <div className="flex items-center gap-1 text-xs">au <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-8 w-36 text-xs" /></div>
            <label className="flex items-center gap-1.5 text-xs cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} data-testid="tice-show-archived" />
              Archivés
            </label>
            <div className="ml-auto flex items-center gap-2 text-xs">
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() - 1); setViewMonth(d); }}>«</Button>
              <span className="font-semibold min-w-[120px] text-center">{viewMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
              <Button variant="outline" size="sm" onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 1); setViewMonth(d); }}>»</Button>
              <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(1); setViewMonth(d); }}>Aujourd&apos;hui</Button>
            </div>
          </CardContent>
        </Card>

        {/* Gantt */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto" data-testid="tice-gantt">
              <div className="flex border-b-2 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 sticky top-0 z-10">
                <div className="flex-shrink-0 w-[360px] border-r border-slate-300 dark:border-slate-700 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Projet</div>
                <div className="flex" style={{ width: `${TOTAL_W}px` }}>
                  {weeks.map((w, i) => {
                    const isNewMonth = i === 0 || w.getMonth() !== weeks[i - 1].getMonth();
                    return (
                      <div key={i} className={`flex-shrink-0 border-r border-slate-200 dark:border-slate-700 text-center text-[10px] py-1 ${isNewMonth ? 'bg-coral-50/40 dark:bg-coral-900/10 font-bold' : ''}`} style={{ width: `${WEEK_W}px` }}>
                        <div className="text-slate-500">S{isoWeek(w)}</div>
                        {isNewMonth && <div className="text-coral-600 text-[9px] uppercase">{w.toLocaleDateString('fr-FR', { month: 'short' })}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                {roots.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Aucun projet {showArchived ? 'archivé ' : ''}à afficher.</div>}
                {roots.map(r => renderRow(r))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>{editing?.id ? 'Modifier le projet' : (editing?.parent_id ? 'Nouveau sous-projet' : 'Nouveau projet')}</DialogTitle></DialogHeader>
            {editing && (
              <div className="grid grid-cols-2 gap-3 py-2">
                <div className="col-span-2"><Label>Titre</Label><Input value={editing.titre || ''} onChange={e => setEditing({ ...editing, titre: e.target.value })} data-testid="tice-input-titre" /></div>
                <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} /></div>
                <div><Label>Date début</Label><Input type="date" value={editing.date_debut || ''} onChange={e => setEditing({ ...editing, date_debut: e.target.value })} /></div>
                <div><Label>Date fin</Label><Input type="date" value={editing.date_fin || ''} onChange={e => setEditing({ ...editing, date_fin: e.target.value })} /></div>
                <div><Label>Statut</Label>
                  <Select value={editing.statut} onValueChange={v => setEditing({ ...editing, statut: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUTS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Progression : {editing.progression || 0}%</Label>
                  <Input type="range" min="0" max="100" value={editing.progression || 0} onChange={e => setEditing({ ...editing, progression: parseInt(e.target.value) })} />
                </div>
                <div><Label>Formateur demandeur</Label>
                  <Select value={editing.formateur_demandeur_id || 'none'} onValueChange={v => setEditing({ ...editing, formateur_demandeur_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.prenom} {f.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Formateur TICE en charge</Label>
                  <Select value={editing.formateur_tice_id || 'none'} onValueChange={v => setEditing({ ...editing, formateur_tice_id: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {formateurs.filter(f => f.tice).map(f => <SelectItem key={f.id} value={f.id}>{f.prenom} {f.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Semaine identifiée (ex: S24 - mardi 09/06)</Label>
                  <Input value={editing.semaine_identifiee || ''} onChange={e => setEditing({ ...editing, semaine_identifiee: e.target.value })} placeholder="S24 - mardi 09/06/2026" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Annuler</Button>
              <Button onClick={save} className="bg-coral-500 hover:bg-coral-600 text-white" data-testid="tice-save">Enregistrer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
