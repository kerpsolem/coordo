import { useState, useEffect, useCallback, useRef } from 'react';
import API from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { ChevronLeft, ChevronRight, Plus, Check, Edit2, Columns, GripVertical, ZoomIn, ZoomOut, MessageSquare } from 'lucide-react';
import { format, addDays, startOfWeek, getWeek, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 15) * 15; return `${String(Math.floor(h / 60)).padStart(2,'0')}:${String(h % 60).padStart(2,'0')}`; }
function snapTo15(m) { return Math.round(m / 15) * 15; }
const START_MIN = 7 * 60 + 30;
const END_MIN = 18 * 60;
const TOTAL_MIN = END_MIN - START_MIN;

export default function PlanningGlobal() {
  const { isAdmin } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [vacances, setVacances] = useState([]);
  const [promotions, setPromotions] = useState([]);
  const [formateurs, setFormateurs] = useState([]);
  const [actTypes, setActTypes] = useState([]);
  const [ues, setUes] = useState([]);
  const [domains, setDomains] = useState([]);
  const [sites, setSites] = useState([]);
  const [groups, setGroups] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sideByView, setSideByView] = useState(false);
  const [selectedPromos, setSelectedPromos] = useState(new Set());
  const [filterSemestre, setFilterSemestre] = useState('all');
  const [editSession, setEditSession] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);

  const [dragInfo, setDragInfo] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [createDrag, setCreateDrag] = useState(null);
  const [createPreview, setCreatePreview] = useState(null);
  const createDragMoved = useRef(false);

  const PX_PER_MIN = 1.2 * zoom;
  const GRID_H = Math.round(TOTAL_MIN * PX_PER_MIN);
  const baseFontBlock = Math.round(10 * zoom);
  const baseFontSmall = Math.round(9 * zoom);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));

  const loadData = useCallback(async () => {
    const dateDebut = format(days[0], 'yyyy-MM-dd');
    const dateFin = format(days[4], 'yyyy-MM-dd');
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (selectedPromos.size > 0) params.promotion_id = [...selectedPromos].join(',');
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    try {
      const [sessR, absR, holR, vacR, proR, fmR, atR, ueR, domR, sitR, grpR] = await Promise.all([
        API.get('/sessions', { params }), API.get('/absences/for-period', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/holidays', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/vacances/for-period', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/promotions'), API.get('/formateurs'), API.get('/activity-types'),
        API.get('/ues'), API.get('/domains'), API.get('/sites'), API.get('/groups')
      ]);
      setSessions(sessR.data); setAbsences(absR.data); setHolidays(holR.data);
      setVacances(vacR.data);
      setPromotions(proR.data); setFormateurs(fmR.data);
      setActTypes(atR.data); setUes(ueR.data); setDomains(domR.data); setSites(sitR.data); setGroups(grpR.data);
    } catch (e) { console.error(e); }
  }, [currentDate, selectedPromos, filterSemestre]);

  useEffect(() => { loadData(); }, [loadData]);

  const mk = (a) => Object.fromEntries(a.map(x => [x.id, x]));
  const promoMap = mk(promotions), fmMap = mk(formateurs), atMap = mk(actTypes);
  const ueMap = mk(ues), domMap = mk(domains), siteMap = mk(sites), grpMap = mk(groups);

  const prevWeek = () => setCurrentDate(d => addWeeks(d, -1));
  const nextWeek = () => setCurrentDate(d => addWeeks(d, 1));
  const displayPromos = selectedPromos.size === 0 ? promotions : promotions.filter(p => selectedPromos.has(p.id));
  const holidayMap = Object.fromEntries(holidays.map(h => [h.date, h.nom]));
  const isHoliday = (dayStr) => !!holidayMap[dayStr];
  // Vacances groupees par promotion : { [promo_id]: { [date]: nom } }
  const vacancesByPromo = vacances.reduce((acc, v) => {
    if (!acc[v.promotion_id]) acc[v.promotion_id] = {};
    acc[v.promotion_id][v.date] = v.nom;
    return acc;
  }, {});
  const getAbsForDay = (dayStr) => {
    const dayAbs = absences.filter(a => a.date === dayStr);
    return dayAbs.map(a => ({
      init: a.formateur_initiales || '?',
      periode: a.periode || (a.journee_entiere ? 'journee' : 'journee'),
    }));
  };

  const ABS_STYLE = {
    journee: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', label: 'J' },
    matin: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', label: 'AM' },
    apres_midi: { bg: 'bg-sky-100 dark:bg-sky-900/40', text: 'text-sky-700 dark:text-sky-300', label: 'PM' },
  };

  const startEdit = (s) => { setHoveredSession(null); setEditSession({ ...s, formateur_ids: s.formateur_ids || [] }); setShowDialog(true); };
  const startNew = (dayStr, hour) => {
    setHoveredSession(null);
    if (dayStr && holidayMap[dayStr]) {
      if (!window.confirm(`${holidayMap[dayStr]} est un jour ferie. Voulez-vous quand meme creer une activite ?`)) return;
    }
    const hEnd = hour ? `${String(Math.min(parseInt(hour.split(':')[0]) + 2, 18)).padStart(2, '0')}:${hour.split(':')[1]}` : '10:00';
    setEditSession({ date: dayStr, date_fin_periode: '', heure_debut: hour || '08:00', heure_fin: hEnd, journee_entiere: false, type_activite_id: '', promotion_id: selectedPromos.size === 1 ? [...selectedPromos][0] : '',
      group_id: '', ue_id: '', semestre: '', formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false, commentaire: '', intitule: '' });
    setShowDialog(true);
  };
  const saveSession = async () => {
    try {
      if (editSession.id) {
        // Editing existing session
        if (editSession.journee_entiere) {
          // Split into matin + apres-midi: update existing as matin, create afternoon copy
          const matin = { ...editSession, heure_debut: '08:30', heure_fin: '12:00', duree: 3.5, journee_entiere: false };
          delete matin.date_fin_periode;
          await API.put(`/sessions/${editSession.id}`, matin);
          const apres = { ...editSession };
          delete apres.id; delete apres.date_fin_periode;
          apres.heure_debut = '13:00'; apres.heure_fin = '16:30'; apres.duree = 3.5; apres.journee_entiere = false;
          await API.post('/sessions', apres);
        } else {
          await API.put(`/sessions/${editSession.id}`, editSession);
        }
      } else if (editSession.date_fin_periode && editSession.date_fin_periode > editSession.date) {
        // Multi-day creation -> bulk
        const at = atMap[editSession.type_activite_id] || {};
        const isStage = (at.nom || '').toLowerCase().includes('stage');
        await API.post('/sessions/bulk', {
          ...editSession,
          date_debut: editSession.date,
          date_fin: editSession.date_fin_periode,
          mode: isStage ? 'stage' : 'multi_day',
          exclude_holidays: true,
        });
      } else if (editSession.journee_entiere) {
        // Single day "Journee entiere" -> create 2 sessions: matin (8h30-12h) + apres-midi (13h-16h30)
        const base = { ...editSession, journee_entiere: false };
        delete base.date_fin_periode;
        await API.post('/sessions', { ...base, heure_debut: '08:30', heure_fin: '12:00', duree: 3.5 });
        await API.post('/sessions', { ...base, heure_debut: '13:00', heure_fin: '16:30', duree: 3.5 });
      } else {
        await API.post('/sessions', editSession);
      }
      setShowDialog(false); loadData();
    } catch (e) { console.error(e); }
  };
  const duplicateSession = async (id) => { try { await API.post(`/sessions/${id}/duplicate`); loadData(); } catch (e) { console.error(e); } };
  const deleteSession = async (id) => { if (!window.confirm('Supprimer cette seance ?')) return; try { await API.delete(`/sessions/${id}`); setShowDialog(false); loadData(); } catch (e) { console.error(e); } };
  const toggleField = async (id, field, value) => { try { await API.patch(`/sessions/${id}/toggle`, { field, value }); loadData(); } catch (e) { console.error(e); } };

  // ---- MOVE/RESIZE existing sessions ----
  const handleDragStart = (e, session, mode) => {
    if (!isAdmin) return;
    e.stopPropagation(); e.preventDefault();
    const startMin = timeToMin(session.heure_debut), endMin = timeToMin(session.heure_fin);
    const top = (startMin - START_MIN) * PX_PER_MIN, height = (endMin - startMin) * PX_PER_MIN;
    setDragInfo({ sessionId: session.id, session, mode, startY: e.clientY, origTop: top, origHeight: height, origStart: startMin, origEnd: endMin });
    setDragPreview({ top, height, startTime: session.heure_debut, endTime: session.heure_fin });
    setHoveredSession(null);
  };

  // ---- CREATE by click-drag on empty grid ----
  const handleGridMouseDown = (e, dayStr) => {
    if (!isAdmin || dragInfo || e.button !== 0) return;
    // Check if click was on a session block (has planning-block parent)
    if (e.target.closest('.planning-block')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const clickMin = snapTo15(START_MIN + offsetY / PX_PER_MIN);
    if (clickMin < START_MIN || clickMin >= END_MIN) return;
    createDragMoved.current = false;
    setCreateDrag({ dayStr, startY: e.clientY, colTop: rect.top, startMin: clickMin });
    setCreatePreview({ top: (clickMin - START_MIN) * PX_PER_MIN, height: 15 * PX_PER_MIN, startTime: minToTime(clickMin), endTime: minToTime(clickMin + 15) });
    e.preventDefault();
  };

  const handleGlobalMouseMove = useCallback((e) => {
    if (dragInfo) {
      const deltaY = e.clientY - dragInfo.startY;
      const deltaMins = snapTo15(deltaY / PX_PER_MIN);
      if (dragInfo.mode === 'move') {
        const newStart = Math.max(START_MIN, Math.min(END_MIN - (dragInfo.origEnd - dragInfo.origStart), dragInfo.origStart + deltaMins));
        const dur = dragInfo.origEnd - dragInfo.origStart;
        // Detect day under cursor
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const dayEl = el?.closest?.('[data-day]');
        const newDay = dayEl ? dayEl.getAttribute('data-day') : null;
        setDragPreview({ top: (newStart - START_MIN) * PX_PER_MIN, height: dur * PX_PER_MIN, startTime: minToTime(newStart), endTime: minToTime(newStart + dur), newDay });
      } else {
        const newEnd = Math.max(dragInfo.origStart + 15, Math.min(END_MIN, dragInfo.origEnd + deltaMins));
        setDragPreview({ top: dragInfo.origTop, height: (newEnd - dragInfo.origStart) * PX_PER_MIN, startTime: minToTime(dragInfo.origStart), endTime: minToTime(newEnd) });
      }
    }
    if (createDrag) {
      createDragMoved.current = true;
      const deltaY = e.clientY - createDrag.startY;
      const endMin = snapTo15(Math.max(createDrag.startMin + 15, Math.min(END_MIN, createDrag.startMin + deltaY / PX_PER_MIN)));
      setCreatePreview({ top: (createDrag.startMin - START_MIN) * PX_PER_MIN, height: (endMin - createDrag.startMin) * PX_PER_MIN, startTime: minToTime(createDrag.startMin), endTime: minToTime(endMin) });
    }
  }, [dragInfo, createDrag, PX_PER_MIN]);

  const handleGlobalMouseUp = useCallback(async () => {
    if (dragInfo && dragPreview) {
      const payload = { ...dragInfo.session, heure_debut: dragPreview.startTime, heure_fin: dragPreview.endTime };
      if (dragInfo.mode === 'move' && dragPreview.newDay && dragPreview.newDay !== dragInfo.session.date) {
        payload.date = dragPreview.newDay;
      }
      try { await API.put(`/sessions/${dragInfo.sessionId}`, payload); loadData(); } catch (e) { console.error(e); }
      setDragInfo(null); setDragPreview(null); return;
    }
    if (createDrag && createPreview) {
      if (createDragMoved.current) {
        setHoveredSession(null);
        setEditSession({
          date: createDrag.dayStr, heure_debut: createPreview.startTime, heure_fin: createPreview.endTime,
          type_activite_id: '', promotion_id: selectedPromos.size === 1 ? [...selectedPromos][0] : '',
          group_id: '', ue_id: '', semestre: '', formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false, commentaire: '', intitule: ''
        });
        setShowDialog(true);
      }
      setCreateDrag(null); setCreatePreview(null); return;
    }
    setDragInfo(null); setDragPreview(null); setCreateDrag(null); setCreatePreview(null);
  }, [dragInfo, dragPreview, createDrag, createPreview, loadData, selectedPromos]);

  useEffect(() => {
    if (dragInfo || createDrag) {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      return () => { window.removeEventListener('mousemove', handleGlobalMouseMove); window.removeEventListener('mouseup', handleGlobalMouseUp); };
    }
  }, [dragInfo, createDrag, handleGlobalMouseMove, handleGlobalMouseUp]);

  const handleMouseEnter = (e, s) => {
    if (dragInfo || createDrag) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: Math.min(r.right + 8, window.innerWidth - 320), y: Math.min(r.top, window.innerHeight - 320) });
    setHoveredSession(s);
  };

  const renderBlock = (s) => {
    const at = atMap[s.type_activite_id] || {};
    const ue = ueMap[s.ue_id] || {};
    const grp = grpMap[s.group_id] || {};
    const formNames = (s.formateur_ids || []).map(fid => fmMap[fid]?.initiales || '?').join(', ');
    const isDragging = dragInfo?.sessionId === s.id;

    return (
      <div key={s.id} data-testid={`session-block-${s.id}`}
        className={`planning-block px-1 py-0.5 overflow-hidden border-l-2 leading-tight h-full relative select-none
          ${isDragging ? 'opacity-40' : 'cursor-pointer'}`}
        style={{ backgroundColor: at.couleur ? `${at.couleur}25` : '#e2e8f0', borderLeftColor: at.couleur || '#94a3b8', fontSize: baseFontBlock }}
        onClick={(e) => { e.stopPropagation(); if (!dragInfo && !createDrag) startEdit(s); }}
        onMouseEnter={(e) => handleMouseEnter(e, s)} onMouseLeave={() => !(dragInfo || createDrag) && setHoveredSession(null)}>
        {/* Move handle */}
        {isAdmin && (
          <div className="absolute top-0 left-0 right-0 h-4 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center"
            onMouseDown={(e) => handleDragStart(e, s, 'move')}>
            <GripVertical size={8} className="text-slate-400 opacity-0 hover:opacity-100" />
          </div>
        )}
        <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
          <span className="font-bold" style={{ color: at.couleur }}>{at.nom}</span>
          {ue.code_ue && <span className="text-slate-500" style={{ fontSize: baseFontSmall }}>{ue.code_ue}</span>}
          {s.statut === 'Valide' && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400" style={{ fontSize: baseFontSmall - 1 }}>
              <Check size={baseFontSmall} /> V
            </span>
          )}
          {s.saisi && (
            <span className="inline-flex items-center gap-0.5 px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400" style={{ fontSize: baseFontSmall - 1 }}>
              <Edit2 size={baseFontSmall} /> S
            </span>
          )}
        </div>
        {s.intitule && <div className="truncate text-slate-600 dark:text-slate-300" style={{ fontSize: baseFontSmall }}>{s.intitule}</div>}
        <div className="text-slate-500" style={{ fontSize: baseFontSmall }}>{s.heure_debut}-{s.heure_fin}{grp.libelle ? ` · ${grp.libelle}` : ''}</div>
        <div className="font-bold text-black">{formNames}</div>
        {s.commentaire && (
          <div className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 truncate" style={{ fontSize: baseFontSmall - 1 }}>
            <MessageSquare size={baseFontSmall - 1} />{s.commentaire}
          </div>
        )}
        {/* Resize handle */}
        {isAdmin && (
          <div className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize z-10 group"
            onMouseDown={(e) => handleDragStart(e, s, 'resize-bottom')}>
            <div className="w-8 h-1 mx-auto rounded bg-slate-300 opacity-0 group-hover:opacity-100 mt-0.5" />
          </div>
        )}
      </div>
    );
  };

  const renderDragOverlay = () => {
    const preview = (dragInfo && dragPreview) ? dragPreview : (createDrag && createPreview && createDragMoved.current) ? createPreview : null;
    if (!preview) return null;
    const durMin = timeToMin(preview.endTime) - timeToMin(preview.startTime);
    const newDayLabel = (dragInfo && dragPreview && dragPreview.newDay && dragPreview.newDay !== dragInfo.session.date)
      ? format(new Date(dragPreview.newDay), 'EEEE d MMM', { locale: fr }) : null;
    return (
      <div className="fixed z-[200] pointer-events-none inset-0">
        <div className="fixed bg-white dark:bg-slate-800 border-2 border-blue-500 rounded-lg shadow-2xl px-3 py-2"
          style={{ left: '50%', top: 12, transform: 'translateX(-50%)' }}>
          {newDayLabel && <span className="text-xs font-semibold text-violet-600 mr-2 capitalize">{newDayLabel} ·</span>}
          <span className="text-sm font-bold text-blue-600">{preview.startTime} - {preview.endTime}</span>
          <span className="text-xs text-slate-500 ml-2">({(durMin / 60).toFixed(1)}h)</span>
        </div>
      </div>
    );
  };

  const renderTooltip = () => {
    if (!hoveredSession || dragInfo || showDialog || createDrag) return null;
    const s = hoveredSession, at = atMap[s.type_activite_id] || {}, promo = promoMap[s.promotion_id] || {};
    const ue = ueMap[s.ue_id] || {}, dom = domMap[s.domain_id] || domMap[ue.domain_id] || {};
    const site = siteMap[s.site_id] || {}, grp = grpMap[s.group_id] || {};
    const forms = (s.formateur_ids || []).map(fid => { const f = fmMap[fid]; return f ? `${f.prenom} ${f.nom} (${f.initiales})` : '?'; });
    return (
      <div className="fixed z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl p-4 w-80 tooltip-enter pointer-events-none"
        style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-200 dark:border-slate-700">
          <div className="w-3 h-3 rounded" style={{ backgroundColor: at.couleur }} />
          <span className="font-bold text-sm">{at.nom}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700">{s.semestre}</span>
          {s.statut === 'Valide' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Valide</span>}
          {s.saisi && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Saisi</span>}
        </div>
        {s.intitule && <p className="text-sm font-semibold mb-2">{s.intitule}</p>}
        <div className="grid grid-cols-[100px_1fr] gap-y-1 text-xs">
          <span className="text-slate-500">Promotion</span><span className="font-medium">{promo.nom}</span>
          {grp.libelle && <><span className="text-slate-500">Groupe</span><span>{grp.libelle}</span></>}
          <span className="text-slate-500">UE</span><span>{ue.code_ue} - {ue.intitule}</span>
          <span className="text-slate-500">Domaine</span><span>{dom.nom}</span>
          <span className="text-slate-500">Formateurs</span><span>{forms.join(', ')}</span>
          <span className="text-slate-500">Lieu</span><span>{site.nom || '-'}</span>
          <span className="text-slate-500">Horaires</span><span className="font-medium">{s.heure_debut} - {s.heure_fin}</span>
          <span className="text-slate-500">Duree</span><span>{s.duree}h</span>
          {s.commentaire && <><span className="text-slate-500">Commentaire</span><span className="text-amber-600">{s.commentaire}</span></>}
        </div>
      </div>
    );
  };

  const PromoGrid = ({ promoId, promoName }) => {
    const promoSessions = promoId === 'all' ? sessions : sessions.filter(s => s.promotion_id === promoId);
    return (
      <Card className="overflow-hidden">
        {promoName && <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b font-semibold" style={{ fontSize: 13 * zoom }}>{promoName}</div>}
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `${Math.round(50 * zoom)}px repeat(5, 1fr)`, minWidth: Math.round(700 * zoom) }}>
            <div className="border-b border-r border-slate-200 dark:border-slate-700 p-1 bg-slate-50 dark:bg-slate-800/30" />
            {days.map((day, i) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const dayAbs = getAbsForDay(dayStr);
              const ferie = holidayMap[dayStr];
              return (
                <div key={i} className={`border-b border-r border-slate-200 dark:border-slate-700 text-center ${ferie ? 'bg-purple-50 dark:bg-purple-950/30' : 'bg-slate-50 dark:bg-slate-800/30'}`}>
                  <div className="text-slate-500 capitalize pt-1" style={{ fontSize: baseFontSmall }}>{format(day, 'EEEE', { locale: fr })}</div>
                  <div className="font-bold pb-1" style={{ fontSize: baseFontBlock + 1 }}>{format(day, 'd MMM', { locale: fr })}</div>
                  {ferie && (
                    <div className="bg-purple-100 dark:bg-purple-900/40 border-t border-purple-200 dark:border-purple-800 px-1 py-0.5 text-purple-700 dark:text-purple-300 font-semibold" style={{ fontSize: baseFontSmall - 1 }}>
                      Ferie · {ferie}
                    </div>
                  )}
                  {dayAbs.length > 0 && (
                    <div className="border-t border-slate-200 dark:border-slate-700 px-1 py-1 flex flex-wrap gap-0.5 justify-center" style={{ fontSize: baseFontSmall - 1 }}>
                      {dayAbs.map((ab, k) => {
                        const st = ABS_STYLE[ab.periode] || ABS_STYLE.journee;
                        return (
                          <span key={k} className={`inline-flex items-center gap-0.5 rounded ${st.bg} px-1 py-0`}>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">{ab.init}</span>
                            <span className={`font-bold ${st.text}`}>{st.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {/* Time col */}
            <div className="border-r border-slate-200 dark:border-slate-700 relative bg-slate-50/50" style={{ height: GRID_H }}>
              {Array.from({ length: 22 }, (_, i) => { const h = 7 + Math.floor((i+1)/2); const m = (i+1)%2===0?'30':'00'; return { label: m==='00'?`${h}:00`:'', min: h*60+parseInt(m) }; })
                .filter(x => x.min >= START_MIN && x.min <= END_MIN).map((x, i) => (
                <div key={i} className="absolute w-full text-slate-400 text-right pr-1" style={{ top: (x.min - START_MIN) * PX_PER_MIN, fontSize: baseFontSmall - 1 }}>
                  {x.label && <span className="bg-slate-50 dark:bg-slate-900 px-0.5">{x.label}</span>}
                </div>
              ))}
            </div>
            {days.map((day, di) => {
              const dayStr = format(day, 'yyyy-MM-dd');
              const ferie = holidayMap[dayStr];
              const vacanceNom = vacancesByPromo[promo.id]?.[dayStr];
              const daySessions = promoSessions.filter(s => s.date === dayStr).sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
              return (
                <div key={di} className={`border-r border-slate-200 dark:border-slate-700 relative ${ferie ? 'bg-purple-50/40 dark:bg-purple-950/10' : ''} ${vacanceNom ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''}`} style={{ height: GRID_H }}
                  data-day={dayStr}
                  onMouseDown={(e) => handleGridMouseDown(e, dayStr)}>
                  {vacanceNom && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                      <span className="text-orange-600 font-bold text-xs uppercase tracking-wide bg-orange-100 dark:bg-orange-900/40 px-2 py-0.5 rounded shadow-sm">
                        {vacanceNom}
                      </span>
                    </div>
                  )}
                  {Array.from({ length: 11 }, (_, i) => 8 + i).map(h => (
                    <div key={h} className="absolute w-full border-t border-slate-100 dark:border-slate-800/50" style={{ top: (h * 60 - START_MIN) * PX_PER_MIN }} />
                  ))}
                  {/* Create preview */}
                  {createDrag && createDrag.dayStr === dayStr && createPreview && createDragMoved.current && (
                    <div className="absolute left-0 right-0 mx-0.5 rounded border-2 border-dashed border-blue-500 bg-blue-100/50 dark:bg-blue-900/30 z-40 pointer-events-none flex items-center justify-center"
                      style={{ top: createPreview.top, height: Math.max(createPreview.height, 15 * PX_PER_MIN) }}>
                      <span className="font-bold text-blue-600" style={{ fontSize: baseFontBlock }}>{createPreview.startTime} - {createPreview.endTime}</span>
                    </div>
                  )}
                  {daySessions.map((s) => {
                    const isDragging = dragInfo?.sessionId === s.id;
                    const sTop = isDragging && dragPreview ? dragPreview.top : Math.max(0, (timeToMin(s.heure_debut) - START_MIN) * PX_PER_MIN);
                    const sHeight = isDragging && dragPreview ? dragPreview.height : Math.max(18 * zoom, (timeToMin(s.heure_fin) - timeToMin(s.heure_debut)) * PX_PER_MIN);
                    const overlapping = daySessions.filter(o => o.id !== s.id && timeToMin(o.heure_debut) < timeToMin(s.heure_fin) && timeToMin(o.heure_fin) > timeToMin(s.heure_debut));
                    const total = overlapping.length + 1;
                    const idx = overlapping.filter(o => daySessions.indexOf(o) < daySessions.indexOf(s)).length;
                    return (
                      <div key={s.id} className={`absolute px-0.5 ${isDragging ? 'z-50' : 'z-[15]'}`}
                        style={{ top: sTop, height: sHeight, width: `${100/total}%`, left: `${(idx*100)/total}%` }}>
                        {renderBlock(s)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-3" data-testid="planning-global">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-3xl font-bold tracking-tight" style={{ fontFamily: 'Outfit' }}>Planning global</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.max(0.6, z - 0.1))} data-testid="zoom-out-global"><ZoomOut size={16} /></Button>
          <span className="text-xs font-medium w-10 text-center">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={() => setZoom(z => Math.min(2, z + 0.1))} data-testid="zoom-in-global"><ZoomIn size={16} /></Button>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <Button variant="outline" size="sm" onClick={prevWeek} data-testid="prev-week"><ChevronLeft size={16} /></Button>
          <span className="text-sm font-semibold px-2"><span className="font-bold text-base">S{weekNum}</span> - {format(days[0], "d MMM", { locale: fr })} au {format(days[4], "d MMM yyyy", { locale: fr })}</span>
          <Button variant="outline" size="sm" onClick={nextWeek} data-testid="next-week"><ChevronRight size={16} /></Button>
          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
          <Input type="date" value={format(currentDate, 'yyyy-MM-dd')}
            onChange={e => e.target.value && setCurrentDate(new Date(e.target.value + 'T00:00:00'))}
            className="h-8 w-36 text-xs" data-testid="date-picker" title="Aller a une date" />
          <Select value={String(weekNum)} onValueChange={v => {
            const w = Number(v);
            const year = currentDate.getFullYear();
            const jan1 = new Date(year, 0, 1);
            const target = addWeeks(startOfWeek(jan1, { weekStartsOn: 1 }), w - 1);
            setCurrentDate(target);
          }}>
            <SelectTrigger className="h-8 w-20 text-xs" data-testid="week-picker"><SelectValue placeholder={`S${weekNum}`} /></SelectTrigger>
            <SelectContent className="max-h-72">
              {Array.from({ length: 52 }, (_, i) => i + 1).map(w => (
                <SelectItem key={w} value={String(w)}>S{w}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())} data-testid="today-btn">Aujourd'hui</Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={selectedPromos.size === 0 ? "default" : "outline"} size="sm" className="h-8 text-xs"
          onClick={() => setSelectedPromos(new Set())} data-testid="filter-promo-all">Toutes</Button>
        {promotions.map(p => (
          <Button key={p.id} size="sm" className="h-8 text-xs" variant={selectedPromos.has(p.id) ? "default" : "outline"}
            onClick={() => { const n = new Set(selectedPromos); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setSelectedPromos(n); }}
            data-testid={`filter-promo-${p.id}`}>{p.nom.replace('Promotion ', '')}</Button>
        ))}
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
        <Select value={filterSemestre} onValueChange={setFilterSemestre}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-semestre"><SelectValue placeholder="Semestre" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous semestres</SelectItem>
            <SelectItem value="pair">Pairs (S2,S4,S6)</SelectItem>
            <SelectItem value="impair">Impairs (S1,S3,S5)</SelectItem>
            {["S1","S2","S3","S4","S5","S6"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={sideByView ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setSideByView(!sideByView)} data-testid="toggle-side-by-side">
          <Columns size={14} className="mr-1" /> Cote a cote
        </Button>
        {isAdmin && <Button size="sm" className="h-8 text-xs" onClick={() => startNew(format(new Date(), 'yyyy-MM-dd'))} data-testid="new-session-btn"><Plus size={14} className="mr-1" /> Nouvelle</Button>}
      </div>

      {sideByView && displayPromos.length > 1 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${displayPromos.length}, 1fr)` }}>
          {displayPromos.map(p => <PromoGrid key={p.id} promoId={p.id} promoName={p.nom} />)}
        </div>
      ) : (
        <div className="space-y-3">
          {displayPromos.map(p => <PromoGrid key={p.id} promoId={p.id} promoName={displayPromos.length > 1 ? p.nom : undefined} />)}
        </div>
      )}

      {renderTooltip()}
      {renderDragOverlay()}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" data-testid="session-dialog">
          <DialogHeader><DialogTitle>{editSession?.id ? 'Modifier la seance' : 'Nouvelle seance'}</DialogTitle></DialogHeader>
          {editSession && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Date {editSession.id ? '' : '(debut)'}</Label><Input type="date" value={editSession.date||''} onChange={e=>setEditSession({...editSession,date:e.target.value})} className="h-8 text-sm" /></div>
              {!editSession.id && (
                <div><Label className="text-xs">Date fin (periode, optionnel)</Label><Input type="date" value={editSession.date_fin_periode||''} onChange={e=>setEditSession({...editSession,date_fin_periode:e.target.value})} className="h-8 text-sm" data-testid="session-date-fin" /></div>
              )}
              {editSession.id && <div><Label className="text-xs">Intitule</Label><Input value={editSession.intitule||''} onChange={e=>setEditSession({...editSession,intitule:e.target.value})} className="h-8 text-sm" /></div>}
              {!editSession.id && <div><Label className="text-xs">Intitule</Label><Input value={editSession.intitule||''} onChange={e=>setEditSession({...editSession,intitule:e.target.value})} className="h-8 text-sm" /></div>}
              <div className="col-span-2 flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <Checkbox checked={editSession.journee_entiere||false} onCheckedChange={v=>setEditSession({...editSession, journee_entiere: v, heure_debut: v ? '08:30' : (editSession.heure_debut||'08:00'), heure_fin: v ? '12:00' : (editSession.heure_fin||'10:00')})} data-testid="session-journee-entiere" />
                  Journee entiere (2 seances : 8h30-12h + 13h-16h30 = 7h)
                </label>
                {editSession.date_fin_periode && editSession.date && editSession.date_fin_periode > editSession.date && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700">Multi-jours</span>
                )}
                {editSession.date && holidayMap[editSession.date] && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-semibold">Ferie · {holidayMap[editSession.date]}</span>
                )}
              </div>
              <div><Label className="text-xs">Debut</Label><Input type="time" value={editSession.heure_debut||''} onChange={e=>setEditSession({...editSession,heure_debut:e.target.value})} className="h-8 text-sm" disabled={editSession.journee_entiere} /></div>
              <div><Label className="text-xs">Fin</Label><Input type="time" value={editSession.heure_fin||''} onChange={e=>setEditSession({...editSession,heure_fin:e.target.value})} className="h-8 text-sm" disabled={editSession.journee_entiere} /></div>
              <div><Label className="text-xs">Type</Label>
                <Select value={editSession.type_activite_id||''} onValueChange={v=>setEditSession({...editSession,type_activite_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a=><SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Promotion</Label>
                <Select value={editSession.promotion_id||''} onValueChange={v=>setEditSession({...editSession,promotion_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p=><SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Groupe</Label>
                <Select value={editSession.group_id||'none'} onValueChange={v=>setEditSession({...editSession,group_id:v==='none'?'':v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Aucun</SelectItem>{groups.map(g=><SelectItem key={g.id} value={g.id}>{g.libelle}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">UE</Label>
                <Select value={editSession.ue_id||''} onValueChange={v=>setEditSession({...editSession,ue_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u=><SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Semestre</Label>
                <Select value={editSession.semestre||''} onValueChange={v=>setEditSession({...editSession,semestre:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Site</Label>
                <Select value={editSession.site_id||''} onValueChange={v=>setEditSession({...editSession,site_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>{sites.map(s=><SelectItem key={s.id} value={s.id}>{s.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Statut</Label>
                <Select value={editSession.statut||'Prevu'} onValueChange={v=>setEditSession({...editSession,statut:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Prevu">Prevu</SelectItem><SelectItem value="Valide">Valide</SelectItem></SelectContent></Select></div>
              <div className="col-span-2"><Label className="text-xs">Formateurs</Label>
                <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                  <button type="button"
                    className="px-2 py-0.5 rounded border text-[11px] cursor-pointer bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700 font-medium"
                    onClick={() => {
                      const allIds = formateurs.map(f => f.id);
                      const cur = editSession.formateur_ids || [];
                      const same = cur.length === allIds.length && cur.every(id => allIds.includes(id));
                      setEditSession({ ...editSession, formateur_ids: same ? [] : allIds });
                    }}
                    data-testid="select-all-formateurs">
                    {((editSession.formateur_ids||[]).length === formateurs.length && formateurs.length>0) ? 'Tout deselectionner' : 'Tous les formateurs'}
                  </button>
                  {formateurs.map(f=>(
                  <label key={f.id} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer
                    ${(editSession.formateur_ids||[]).includes(f.id)?'bg-slate-200 dark:bg-slate-700 border-slate-400':'border-slate-200 dark:border-slate-700'}`}>
                    <input type="checkbox" className="w-3 h-3" checked={(editSession.formateur_ids||[]).includes(f.id)}
                      onChange={e=>{const ids=editSession.formateur_ids||[];setEditSession({...editSession,formateur_ids:e.target.checked?[...ids,f.id]:ids.filter(i=>i!==f.id)});}}/>
                    {f.initiales} - {f.prenom} {f.nom}</label>))}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={editSession.saisi||false} onCheckedChange={v=>setEditSession({...editSession,saisi:v})}/>Saisi</label></div>
              <div className="col-span-2"><Label className="text-xs">Commentaire</Label><Input value={editSession.commentaire||''} onChange={e=>setEditSession({...editSession,commentaire:e.target.value})} className="h-8 text-sm"/></div>
              <div className="col-span-2 flex justify-between pt-2 border-t">
                <div className="flex gap-2">{editSession.id&&(<>
                  <Button variant="outline" size="sm" className="text-xs" onClick={()=>duplicateSession(editSession.id)}>Dupliquer</Button>
                  <Button variant="destructive" size="sm" className="text-xs" onClick={()=>deleteSession(editSession.id)}>Supprimer</Button></>)}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="text-xs" onClick={()=>setShowDialog(false)}>Annuler</Button>
                  <Button size="sm" className="text-xs" onClick={saveSession} data-testid="save-session">Enregistrer</Button></div></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
