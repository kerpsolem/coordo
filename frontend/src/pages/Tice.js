import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, ChevronRight, ChevronDown, Archive, ArchiveRestore, Trash2, Edit3, Search, ChevronLeft } from 'lucide-react';

const STATUTS = ['À faire', 'En cours', 'Terminé'];

// ----------------- date helpers -----------------
function generateWeeks(from, to) {
  const out = [];
  const cur = new Date(from);
  const day = (cur.getDay() + 6) % 7;
  cur.setDate(cur.getDate() - day); // align Monday
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
function fmtDate(d) { return d.toISOString().slice(0, 10); }
function parseDate(s) { return s ? new Date(s + 'T00:00:00') : null; }
function frDate(d) { return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long' }); }
function frShort(d) { return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }); }
function getTuesdaysInRange(date_debut, date_fin) {
  const d = parseDate(date_debut); const e = parseDate(date_fin);
  if (!d || !e || e < d) return [];
  const cur = new Date(d);
  while (cur.getDay() !== 2) cur.setDate(cur.getDate() + 1);
  const out = [];
  while (cur <= e) { out.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 7); }
  return out;
}

// ----------------- visual tokens -----------------
const STATUT_PILL = {
  'À faire':  'bg-slate-100 text-slate-600 border border-slate-200',
  'En cours': 'bg-amber-100 text-amber-800 border border-amber-200',
  'Terminé':  'bg-emerald-100 text-emerald-700 border border-emerald-200',
};

// Bar colors (light base = total duration, dark overlay = progression)
const BAR_BASE = {
  'À faire':  'bg-slate-200',
  'En cours': 'bg-coral-200',
  'Terminé':  'bg-emerald-300',
};
const BAR_FILL = {
  'À faire':  'bg-slate-500',
  'En cours': 'bg-coral-500',
  'Terminé':  'bg-emerald-500',
};

export default function Tice() {
  const { isTice } = useAuth();
  const [projets, setProjets] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [filterStatuts, setFilterStatuts] = useState({ 'À faire': true, 'En cours': true, 'Terminé': true });
  const [expandedParents, setExpandedParents] = useState({});
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [viewMonth, setViewMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const load = useCallback(async () => {
    try {
      const [pr, fm] = await Promise.all([API.get('/tice/projets'), API.get('/formateurs')]);
      setProjets(pr.data); setFormateurs(fm.data);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { if (isTice) load(); }, [isTice, load]);

  // ---- Gantt range (3 months window) ----
  const ganttFrom = useMemo(() => { const d = new Date(viewMonth); d.setDate(1); return d; }, [viewMonth]);
  const ganttTo = useMemo(() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 3); d.setDate(0); return d; }, [viewMonth]);
  const weeks = useMemo(() => generateWeeks(ganttFrom, ganttTo), [ganttFrom, ganttTo]);
  const WEEK_W = 78;
  const TOTAL_W = weeks.length * WEEK_W;
  const ganttFromMs = weeks[0]?.getTime();

  const archivedCount = useMemo(() => projets.filter(p => p.archive).length, [projets]);
  const filtered = useMemo(() => {
    let list = projets.filter(p => p.archive === showArchived);
    list = list.filter(p => filterStatuts[p.statut] !== false);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => (p.titre || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q));
    }
    if (filterDateFrom) list = list.filter(p => (p.date_fin || '9999') >= filterDateFrom);
    if (filterDateTo)   list = list.filter(p => (p.date_debut || '0000') <= filterDateTo);
    return list;
  }, [projets, showArchived, filterStatuts, search, filterDateFrom, filterDateTo]);

  // ---- Drag & resize ----
  const dragRef = useRef(null);
  const progressRef = useRef(null);
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.startX;
      const daysDelta = Math.round(dx / (WEEK_W / 7));
      const next = { ...d.snapshot };
      if (d.mode === 'move') {
        next.date_debut = fmtDate(new Date(d.origDebut.getTime() + daysDelta * 86400000));
        next.date_fin   = fmtDate(new Date(d.origFin.getTime()   + daysDelta * 86400000));
      } else if (d.mode === 'resize-right') {
        const newFin = new Date(d.origFin.getTime() + daysDelta * 86400000);
        if (newFin >= d.origDebut) next.date_fin = fmtDate(newFin);
      }
      setProjets(ps => ps.map(p => p.id === next.id ? next : p));
    };
    const onUp = async () => {
      const d = dragRef.current; if (!d) return;
      document.body.style.cursor = ''; document.body.style.userSelect = '';
      dragRef.current = null;
      const cur = await new Promise(res => setProjets(ps => { res(ps); return ps; }));
      const updated = cur.find(p => p.id === d.id);
      if (updated) { try { await API.put(`/tice/projets/${updated.id}`, updated); } catch (e) { console.error(e); load(); } }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [load]);
  useEffect(() => {
    const onMove = (e) => {
      const d = progressRef.current; if (!d) return;
      const pct = Math.max(0, Math.min(100, ((e.clientX - d.rect.left) / d.rect.width) * 100));
      setProjets(ps => ps.map(p => p.id === d.id ? { ...p, progression: Math.round(pct) } : p));
    };
    const onUp = async () => {
      const d = progressRef.current; if (!d) return;
      progressRef.current = null;
      const cur = await new Promise(res => setProjets(ps => { res(ps); return ps; }));
      const updated = cur.find(p => p.id === d.id);
      if (updated) try { await API.put(`/tice/projets/${updated.id}`, updated); } catch (e) { load(); }
    };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [load]);

  if (!isTice) {
    return <div className="p-8 text-center text-slate-500">Accès réservé aux administrateurs et formateurs TICE.</div>;
  }

  const roots = filtered.filter(p => !p.parent_id);
  const childrenOf = (pid) => filtered.filter(p => p.parent_id === pid);

  // ----- CRUD -----
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
      if (editing.id) await API.put(`/tice/projets/${editing.id}`, editing);
      else            await API.post('/tice/projets', editing);
      setDialogOpen(false); setEditing(null); load();
    } catch (e) { alert(e.response?.data?.detail || 'Erreur'); }
  };
  const remove = async (id) => {
    if (!window.confirm('Supprimer ce projet et ses sous-projets ?')) return;
    await API.delete(`/tice/projets/${id}`); load();
  };
  const toggleArchive = async (p) => { await API.put(`/tice/projets/${p.id}`, { ...p, archive: !p.archive }); load(); };

  // ----- drag handlers -----
  const onBarMouseDown = (e, p, mode) => {
    e.preventDefault(); e.stopPropagation();
    const debut = parseDate(p.date_debut); const fin = parseDate(p.date_fin);
    if (!debut || !fin) return;
    dragRef.current = { id: p.id, mode, startX: e.clientX, origDebut: debut, origFin: fin, snapshot: { ...p } };
    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
    document.body.style.userSelect = 'none';
  };
  const onProgressMouseDown = (e, p) => {
    e.preventDefault(); e.stopPropagation();
    const bar = e.currentTarget.parentElement;
    progressRef.current = { id: p.id, rect: bar.getBoundingClientRect(), snapshot: { ...p } };
  };

  // ---------------- Render bar ----------------
  const renderBar = (p) => {
    const debut = parseDate(p.date_debut); const fin = parseDate(p.date_fin);
    if (!debut || !fin || !ganttFromMs) return null;
    const leftDays = (debut.getTime() - ganttFromMs) / 86400000;
    const widthDays = Math.max(1, (fin.getTime() - debut.getTime()) / 86400000 + 1);
    const left = (leftDays * WEEK_W) / 7;
    const width = (widthDays * WEEK_W) / 7;
    const baseCls = BAR_BASE[p.statut] || BAR_BASE['À faire'];
    const fillCls = BAR_FILL[p.statut] || BAR_FILL['À faire'];
    const pct = Math.max(0, Math.min(100, p.progression || 0));
    const isTermine = p.statut === 'Terminé';

    return (
      <div className="absolute" style={{ left: `${left}px`, width: `${width}px`, top: '24px', height: '36px' }}>
        <div
          className={`relative h-full rounded-full ${baseCls} cursor-grab hover:brightness-105 group transition-shadow shadow-sm`}
          onMouseDown={(e) => onBarMouseDown(e, p, 'move')}
          onDoubleClick={() => startEdit(p)}
          title={`${p.titre} • ${p.date_debut} → ${p.date_fin} • ${pct}%`}
          data-testid={`gantt-bar-${p.id}`}
        >
          {/* dark overlay = progression */}
          {!isTermine && pct > 0 && (
            <div className={`absolute inset-y-0 left-0 ${fillCls} rounded-full`} style={{ width: `${pct}%` }} />
          )}
          {isTermine && <div className={`absolute inset-0 ${fillCls} rounded-full`} />}
          {/* progress drag handle */}
          {!isTermine && (
            <div className="absolute top-0 bottom-0 cursor-ew-resize z-20" style={{ left: `calc(${pct}% - 5px)`, width: '10px' }}
                 onMouseDown={(e) => onProgressMouseDown(e, p)} title="Tirer pour ajuster la progression" />
          )}
          {/* Title */}
          <div className="absolute inset-0 flex items-center px-4 text-[12.5px] text-white font-semibold truncate pointer-events-none z-10">
            <span className="truncate">{p.titre}{!isTermine && pct > 0 && ` — ${pct}%`}</span>
          </div>
          {/* right resize handle */}
          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r-full z-20"
               onMouseDown={(e) => onBarMouseDown(e, p, 'resize-right')} title="Tirer pour allonger" />
        </div>
      </div>
    );
  };

  // ---------------- Render row ----------------
  const renderRow = (p, depth = 0) => {
    const subs = childrenOf(p.id);
    const isOpen = expandedParents[p.id] ?? true;
    const demandeur = formateurs.find(f => f.id === p.formateur_demandeur_id);
    const respTice  = formateurs.find(f => f.id === p.formateur_tice_id);

    return (
      <React.Fragment key={p.id}>
        <div className="flex border-b border-slate-100 hover:bg-cream-50/70 group relative" style={{ minHeight: '92px' }}>
          {/* ----- LEFT META ----- */}
          <div className="flex-shrink-0 w-[330px] border-r border-slate-200 bg-white px-4 py-3 flex items-start gap-2" style={{ paddingLeft: `${16 + depth * 18}px` }}>
            {subs.length > 0 ? (
              <button onClick={() => setExpandedParents(e => ({ ...e, [p.id]: !isOpen }))}
                      className="mt-0.5 text-slate-400 hover:text-coral-600 flex-shrink-0" title={isOpen ? 'Replier' : 'Déplier'}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
            ) : <span className="w-4 flex-shrink-0" />}
            <div className="flex-1 min-w-0 space-y-1">
              <div className="flex items-center gap-1.5">
                <div className={`text-[15px] font-bold text-navy-900 truncate ${p.archive ? 'line-through text-slate-400' : ''}`} title={p.titre}>{p.titre}</div>
                {subs.length > 0 && (
                  <span className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-white border border-coral-300 text-coral-600">{subs.length}</span>
                )}
              </div>
              {demandeur && <div className="text-[12px] text-slate-500 truncate">Demande : {demandeur.prenom} {demandeur.nom}</div>}
              {respTice && <div className="text-[12px] text-coral-600 truncate font-medium">Resp. TICE : {respTice.prenom} {respTice.nom}</div>}
              <div>
                <span className={`inline-block text-[11px] px-2.5 py-0.5 rounded-md font-semibold ${STATUT_PILL[p.statut] || STATUT_PILL['À faire']}`}>{p.statut}</span>
              </div>
            </div>
            {/* Action icons (visible on hover) */}
            <div className="flex flex-col gap-1 opacity-100 lg:opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-1">
              <button onClick={() => startEdit(p)} className="text-slate-400 hover:text-navy-900 p-1 rounded hover:bg-slate-100" title="Modifier"><Edit3 size={15} /></button>
              <button onClick={() => startCreate(p.id)} className="text-coral-500 hover:text-coral-700 p-1 rounded hover:bg-coral-50" title="Ajouter sous-projet"><Plus size={15} /></button>
              <button onClick={() => toggleArchive(p)} className="text-navy-900 hover:text-amber-600 p-1 rounded hover:bg-slate-100" title={p.archive ? 'Désarchiver' : 'Archiver'}>
                {p.archive ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              <button onClick={() => remove(p.id)} className="text-red-500 hover:text-red-700 p-1 rounded hover:bg-red-50" title="Supprimer"><Trash2 size={15} /></button>
            </div>
          </div>
          {/* ----- RIGHT GANTT ----- */}
          <div className="relative flex-1 overflow-hidden bg-white" style={{ minWidth: `${TOTAL_W}px` }}>
            {/* Grid columns */}
            {weeks.map((_, i) => (
              <div key={i} className="absolute top-0 bottom-0 border-r border-slate-100"
                   style={{ left: `${(i + 1) * WEEK_W}px`, width: 0 }} />
            ))}
            {/* Mardi markers (vertical navy bars) */}
            {(p.mardis || []).map(t => {
              const td = parseDate(t); if (!td || !ganttFromMs) return null;
              const offDays = (td.getTime() - ganttFromMs) / 86400000;
              const x = (offDays * WEEK_W) / 7 + (WEEK_W / 14);
              if (x < 0 || x > TOTAL_W) return null;
              return (
                <div key={t} className="absolute top-2 bottom-2 w-[3px] bg-navy-900 pointer-events-none rounded-full z-10"
                     style={{ left: `${x}px` }} title={`Mardi ${td.toLocaleDateString('fr-FR')}`} />
              );
            })}
            {renderBar(p)}
          </div>
        </div>
        {isOpen && subs.map(s => renderRow(s, depth + 1))}
      </React.Fragment>
    );
  };

  // ---------------- Header dates label ----------------
  const headerLabel = `${frDate(ganttFrom)} – ${frDate(ganttTo)} ${ganttTo.getFullYear()}`;

  return (
    <div className="space-y-4" data-testid="tice-page">
        {/* ========== PAGE HEADER ========== */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-navy-900 tracking-tight">TICE – Suivi des projets</h1>
            <p className="text-sm text-slate-500 mt-1">Diagramme de Gantt des projets pédagogiques numériques en cours.</p>
          </div>
          <Button onClick={() => startCreate(null)} data-testid="tice-new-project"
                  className="bg-coral-500 hover:bg-coral-600 text-white shadow-md font-semibold h-11 px-5 rounded-xl">
            <Plus size={18} className="mr-1.5" /> Nouveau projet
          </Button>
        </div>

        {/* ========== FILTER BAR ========== */}
        <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
          <CardContent className="py-3 px-5 flex flex-wrap items-center gap-4">
            {/* Toggle vue active */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className={`relative inline-block w-10 h-6 rounded-full transition-colors ${showArchived ? 'bg-coral-500' : 'bg-slate-300'}`}>
                <input type="checkbox" className="sr-only" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} data-testid="tice-show-archived" />
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showArchived ? 'translate-x-4' : ''}`} />
              </span>
              <span className="text-sm font-semibold text-navy-900">{showArchived ? 'Vue archivés' : 'Vue active'}</span>
            </label>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-cream-100 border border-cream-300 text-[11px] font-semibold text-navy-900">
              {archivedCount} archivé{archivedCount > 1 ? 's' : ''}
            </span>

            <div className="ml-auto flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)}
                       className="w-56 h-9 pl-8 text-sm border-slate-200 rounded-lg bg-white" data-testid="tice-search" />
              </div>
              {/* Date range */}
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <span>Du</span>
                <Input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="h-9 w-40 text-sm border-slate-200 rounded-lg bg-white" />
                <span>au</span>
                <Input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="h-9 w-40 text-sm border-slate-200 rounded-lg bg-white" />
              </div>
              <span className="text-sm text-slate-400 font-medium">{filtered.length} projet{filtered.length > 1 ? 's' : ''}</span>
            </div>
          </CardContent>
        </Card>

        {/* ========== STATUS QUICK FILTERS ========== */}
        <div className="flex items-center gap-2 px-1" data-testid="tice-filter-statuts">
          <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">Statuts :</span>
          {STATUTS.map(s => {
            const active = filterStatuts[s] !== false;
            const count = projets.filter(p => p.archive === showArchived && p.statut === s).length;
            const cls = active ? STATUT_PILL[s] : 'bg-white text-slate-400 border border-slate-200 opacity-60';
            return (
              <button key={s} type="button" onClick={() => setFilterStatuts(p => ({ ...p, [s]: !active }))}
                      className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-all ${cls}`}
                      data-testid={`tice-statut-${s}`}>
                {s} ({count})
              </button>
            );
          })}
        </div>

        {/* ========== DATE NAV ========== */}
        <Card className="bg-white border border-slate-200 shadow-sm rounded-xl">
          <CardContent className="py-3 px-5 flex items-center justify-between">
            <div className="text-lg font-bold text-navy-900">{headerLabel}</div>
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() - 1); setViewMonth(d); }}
                      className="w-9 h-9 rounded-lg border border-slate-200 hover:border-coral-400 hover:bg-coral-50 text-navy-900 flex items-center justify-center transition" aria-label="Précédent">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => { const d = new Date(); d.setDate(1); setViewMonth(d); }}
                      className="h-9 px-4 rounded-lg border border-slate-200 hover:border-coral-400 hover:bg-coral-50 text-sm font-semibold text-navy-900 transition">
                Aujourd&apos;hui
              </button>
              <button onClick={() => { const d = new Date(viewMonth); d.setMonth(d.getMonth() + 1); setViewMonth(d); }}
                      className="w-9 h-9 rounded-lg border border-slate-200 hover:border-coral-400 hover:bg-coral-50 text-navy-900 flex items-center justify-center transition" aria-label="Suivant">
                <ChevronRight size={16} />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* ========== GANTT TABLE ========== */}
        <Card className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
          <div className="overflow-x-auto" data-testid="tice-gantt">
            {/* Gantt header */}
            <div className="flex border-b border-slate-200 bg-white">
              <div className="flex-shrink-0 w-[330px] border-r border-slate-200 px-4 py-3 text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                Projet
              </div>
              <div className="flex" style={{ width: `${TOTAL_W}px` }}>
                {weeks.map((w, i) => (
                  <div key={i} className="flex-shrink-0 border-r border-slate-100 text-center py-2"
                       style={{ width: `${WEEK_W}px` }}>
                    <div className="text-[12px] font-extrabold text-coral-500">S{isoWeek(w)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{frShort(w)}</div>
                  </div>
                ))}
              </div>
            </div>
            {/* Rows */}
            <div>
              {roots.length === 0 && (
                <div className="p-10 text-center text-sm text-slate-400">
                  Aucun projet {showArchived ? 'archivé ' : ''}à afficher.
                </div>
              )}
              {roots.map(r => renderRow(r))}
            </div>
          </div>
        </Card>

        {/* ========== EDIT DIALOG ========== */}
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
                <div className="col-span-2"><Label>Mardis identifiés (sélection multiple)</Label>
                  {(() => {
                    const tuesdays = getTuesdaysInRange(editing.date_debut, editing.date_fin);
                    const sel = editing.mardis || [];
                    if (tuesdays.length === 0) return <p className="text-xs text-slate-400 italic mt-1">Renseignez d&apos;abord les dates de début et fin.</p>;
                    return (
                      <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-32 overflow-y-auto p-2 rounded border border-slate-200" data-testid="tice-mardis">
                        {tuesdays.map(t => {
                          const checked = sel.includes(t);
                          const d = parseDate(t); const w = isoWeek(d);
                          return (
                            <label key={t} className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] cursor-pointer ${checked ? 'bg-coral-100 border-coral-400 text-coral-700 font-semibold' : 'border-slate-200 hover:bg-slate-50'}`}>
                              <input type="checkbox" className="w-3 h-3" checked={checked}
                                     onChange={e => {
                                       const next = e.target.checked ? [...sel, t].sort() : sel.filter(x => x !== t);
                                       setEditing({ ...editing, mardis: next });
                                     }} />
                              S{w}·{frShort(d)}
                            </label>
                          );
                        })}
                        {sel.length > 0 && <span className="text-[10px] text-slate-500 ml-auto self-center">{sel.length} mardi{sel.length > 1 ? 's' : ''} sélectionné{sel.length > 1 ? 's' : ''}</span>}
                      </div>
                    );
                  })()}
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
  );
}
