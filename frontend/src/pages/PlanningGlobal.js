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
import { ChevronLeft, ChevronRight, Plus, Check, Edit2, Columns, GripVertical, ZoomIn, ZoomOut, MessageSquare, ListTodo, MapPin, Clock, GraduationCap } from 'lucide-react';
import { format, addDays, startOfWeek, getWeek, addWeeks } from 'date-fns';
import { fr } from 'date-fns/locale';

function timeToMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function minToTime(m) { const h = Math.floor(m / 15) * 15; return `${String(Math.floor(h / 60)).padStart(2,'0')}:${String(h % 60).padStart(2,'0')}`; }
function snapTo15(m) { return Math.round(m / 15) * 15; }
const START_MIN = 7 * 60 + 30;
const END_MIN = 18 * 60;
const TOTAL_MIN = END_MIN - START_MIN;
const LANES = 16; // 8 groupes × 2 sous-lettres (a/b) = 16 sous-colonnes

// Parse a group libelle into the lane indices (0..15) it covers.
// "Groupe 1a" -> [0]; "Groupe 1b" -> [1]; "Groupe 1" (no letter) -> [0, 1]
// "1/2 promo" -> [0..7] (left half by default), "1/4 promo" -> [0..3], "1/8" -> [0]
// Unknown -> []
function groupToLanes(libelle) {
  if (!libelle) return [];
  const s = libelle.toLowerCase().trim();
  // "Groupe 1a", "Groupe 1 a", "1a", "g1a" → lane 0
  const mLetter = s.match(/^(?:groupe\s*|g)?0*(\d)\s*([ab])$/);
  if (mLetter) {
    const n = parseInt(mLetter[1], 10);
    if (n >= 1 && n <= 8) return [2 * (n - 1) + (mLetter[2] === 'b' ? 1 : 0)];
  }
  // "Groupe 1", "G1", "1" (alone) → lanes [0, 1]
  const mNum = s.match(/^(?:groupe\s*|g)?0*(\d)$/);
  if (mNum) {
    const n = parseInt(mNum[1], 10);
    if (n >= 1 && n <= 8) return [2 * (n - 1), 2 * (n - 1) + 1];
  }
  if (s.includes('1/2') || s.includes('demi')) return [0, 1, 2, 3, 4, 5, 6, 7];
  if (s.includes('1/4') || s.includes('quart')) return [0, 1, 2, 3];
  if (s.includes('1/8') || s.includes('huiti')) return [0];
  return [];
}

// Given a list of group_ids and the groups collection, compute { left%, width% }.
// - No groups -> full width (Promo entière)
// - Lanes contiguous -> span min..max
// - Lanes non-contiguous -> width = #lanes / 16, positioned to the side with majority
function computeLaneLayout(groupIds, groups) {
  if (!groupIds || groupIds.length === 0) return { left: 0, width: 100 };
  const allLanes = new Set();
  for (const gid of groupIds) {
    const g = groups.find(x => x.id === gid);
    if (!g) continue;
    groupToLanes(g.libelle).forEach(l => allLanes.add(l));
  }
  if (allLanes.size === 0) return { left: 0, width: 100 };
  const arr = Array.from(allLanes).sort((a, b) => a - b);
  const minL = arr[0], maxL = arr[arr.length - 1];
  const contiguous = (maxL - minL + 1) === arr.length;
  if (contiguous) {
    return { left: (minL / LANES) * 100, width: ((maxL - minL + 1) / LANES) * 100 };
  }
  // Non-contiguous : largeur = nb_lanes/16, position selon majorité gauche/droite
  const leftCount = arr.filter(l => l < LANES / 2).length;
  const rightCount = arr.length - leftCount;
  const width = (arr.length / LANES) * 100;
  if (leftCount >= rightCount) return { left: 0, width };
  return { left: 100 - width, width };
}

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
  const [filterUE, setFilterUE] = useState('all');
  const [editSession, setEditSession] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showSiteSection, setShowSiteSection] = useState(false);
  const [hoveredSession, setHoveredSession] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [filterFormateur, setFilterFormateur] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [aProgrammer, setAProgrammer] = useState([]);
  const [dragOverSidebar, setDragOverSidebar] = useState(false);
  const [dragingSession, setDraggingSession] = useState(null);
  const [dragActivite, setDragActivite] = useState(null); // activity from sidebar -> drop on grid
  const [dragOverDay, setDragOverDay] = useState(null); // promoId|dayStr while dragging activity
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedDayIdxs, setSelectedDayIdxs] = useState([0, 1, 2, 3, 4]); // Lun=0..Ven=4

  const [dragInfo, setDragInfo] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [createDrag, setCreateDrag] = useState(null);
  const [createPreview, setCreatePreview] = useState(null);
  const createDragMoved = useRef(false);

  const PX_PER_MIN = 1.2 * zoom;
  const GRID_H = Math.round(TOTAL_MIN * PX_PER_MIN);
  const baseFontBlock = Math.round(11 * zoom);
  const baseFontSmall = Math.round(10 * zoom);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const weekNum = getWeek(currentDate, { weekStartsOn: 1 });
  const allWeekDays = Array.from({ length: 5 }, (_, i) => addDays(weekStart, i));
  const days = selectedDayIdxs.length > 0
    ? selectedDayIdxs.slice().sort((a, b) => a - b).map(i => addDays(weekStart, i))
    : allWeekDays;
  const nbDays = days.length;

  const loadData = useCallback(async () => {
    const dateDebut = format(allWeekDays[0], 'yyyy-MM-dd');
    const dateFin = format(allWeekDays[4], 'yyyy-MM-dd');
    const params = { date_debut: dateDebut, date_fin: dateFin };
    if (selectedPromos.size > 0) params.promotion_id = [...selectedPromos].join(',');
    if (filterSemestre !== 'all') params.semestre = filterSemestre;
    try {
      const [sessR, absR, holR, vacR, proR, fmR, atR, ueR, domR, sitR, grpR, apR] = await Promise.all([
        API.get('/sessions', { params }), API.get('/absences/for-period', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/holidays', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/vacances/for-period', { params: { date_debut: dateDebut, date_fin: dateFin } }),
        API.get('/promotions'), API.get('/formateurs'), API.get('/activity-types'),
        API.get('/ues'), API.get('/domains'), API.get('/sites'), API.get('/groups'),
        API.get('/fiches-projet/a-programmer', { params: selectedPromos.size === 1 ? { promotion_id: [...selectedPromos][0] } : {} })
      ]);
      setSessions(sessR.data); setAbsences(absR.data); setHolidays(holR.data);
      setVacances(vacR.data);
      setPromotions(proR.data); setFormateurs(fmR.data);
      setActTypes(atR.data); setUes(ueR.data); setDomains(domR.data); setSites(sitR.data); setGroups(grpR.data);
      setAProgrammer(apR.data || []);
    } catch (e) { console.error(e); }
  }, [currentDate, selectedPromos, filterSemestre]);

  useEffect(() => { loadData(); }, [loadData]);

  const mk = (a) => Object.fromEntries(a.map(x => [x.id, x]));
  const promoMap = mk(promotions), fmMap = mk(formateurs), atMap = mk(actTypes);
  const ueMap = mk(ues), domMap = mk(domains), siteMap = mk(sites), grpMap = mk(groups);

  // Stable color palette per domain (used when domain has no custom couleur)
  const DOMAIN_PALETTE = ['#22C55E', '#EC4899', '#3B82F6', '#F59E0B', '#8B5CF6', '#06B6D4', '#EF4444', '#84CC16'];
  const getDomainColor = (d) => {
    if (!d) return '#cbd5e1';
    if (d.couleur) return d.couleur;
    const key = d.id || d.nom || '';
    let h = 0;
    for (let i = 0; i < key.length; i++) h = ((h * 31) + key.charCodeAt(i)) >>> 0;
    return DOMAIN_PALETTE[h % DOMAIN_PALETTE.length];
  };

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

  const startEdit = (s) => { setHoveredSession(null); setEditSession({ ...s, formateur_ids: s.formateur_ids || [], joker_formateur_ids: s.joker_formateur_ids || [] }); setShowDialog(true); };
  const startNew = (dayStr, hour) => {
    setHoveredSession(null);
    if (dayStr && holidayMap[dayStr]) {
      if (!window.confirm(`${holidayMap[dayStr]} est un jour ferie. Voulez-vous quand meme creer une activite ?`)) return;
    }
    const hEnd = hour ? `${String(Math.min(parseInt(hour.split(':')[0]) + 2, 18)).padStart(2, '0')}:${hour.split(':')[1]}` : '10:00';
    setEditSession({ date: dayStr, date_fin_periode: '', heure_debut: hour || '08:00', heure_fin: hEnd, journee_entiere: false, type_activite_id: '', promotion_id: selectedPromos.size === 1 ? [...selectedPromos][0] : '',
      group_id: '', ue_id: '', semestre: '', formateur_ids: [], joker_formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false, commentaire: '', intitule: '' });
    setShowDialog(true);
  };
  const saveSession = async () => {
    try {
      // Extract internal "_linked_*" hints for fiche projet linkage (do not send them to backend as-is)
      const linkedActId = editSession._linked_activite_id || '';
      const linkedFicheId = editSession._linked_fiche_id || '';
      const cleanSession = { ...editSession };
      delete cleanSession._linked_activite_id;
      delete cleanSession._linked_fiche_id;
      let createdId = null;
      if (cleanSession.id) {
        // Editing existing session
        if (cleanSession.journee_entiere) {
          const matin = { ...cleanSession, heure_debut: '08:30', heure_fin: '12:00', duree: 3.5, journee_entiere: false };
          delete matin.date_fin_periode;
          await API.put(`/sessions/${cleanSession.id}`, matin);
          const apres = { ...cleanSession };
          delete apres.id; delete apres.date_fin_periode;
          apres.heure_debut = '13:00'; apres.heure_fin = '16:30'; apres.duree = 3.5; apres.journee_entiere = false;
          await API.post('/sessions', apres);
        } else {
          await API.put(`/sessions/${cleanSession.id}`, cleanSession);
        }
        createdId = cleanSession.id;
      } else if (cleanSession.date_fin_periode && cleanSession.date_fin_periode > cleanSession.date) {
        const at = atMap[cleanSession.type_activite_id] || {};
        const isStage = (at.nom || '').toLowerCase().includes('stage');
        await API.post('/sessions/bulk', {
          ...cleanSession,
          date_debut: cleanSession.date,
          date_fin: cleanSession.date_fin_periode,
          mode: isStage ? 'stage' : 'multi_day',
          exclude_holidays: true,
        });
      } else if (cleanSession.journee_entiere) {
        const base = { ...cleanSession, journee_entiere: false };
        delete base.date_fin_periode;
        await API.post('/sessions', { ...base, heure_debut: '08:30', heure_fin: '12:00', duree: 3.5 });
        await API.post('/sessions', { ...base, heure_debut: '13:00', heure_fin: '16:30', duree: 3.5 });
      } else {
        const { data: created } = await API.post('/sessions', cleanSession);
        createdId = created?.id;
      }
      // If user linked a fiche-projet activity, attach the session_id to it
      if (linkedActId && linkedFicheId) {
        if (createdId) {
          try { await API.post(`/fiches-projet/${linkedFicheId}/activites/${linkedActId}/link-session`, { session_id: createdId }); }
          catch (err) { console.error('Link to fiche projet failed:', err); }
        } else {
          // Multi-day or journée-entière paths : link to the first created session would require knowing its id.
          // Inform user that the linking was skipped to avoid silent data inconsistency.
          alert('Note : la séquence n\'a pas pu être liée automatiquement à cette séance multi-jours / journée entière. Vous pouvez créer une séance simple et la lier ensuite.');
        }
      }
      setShowDialog(false); loadData();
    } catch (e) { console.error(e); }
  };
  const duplicateSession = async (id) => { try { await API.post(`/sessions/${id}/duplicate`); loadData(); } catch (e) { console.error(e); } };
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteSession = async (id) => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 4000);
      return;
    }
    try {
      await API.delete(`/sessions/${id}`);
      setShowDialog(false);
      setConfirmDelete(false);
      loadData();
    } catch (e) {
      console.error('Delete failed:', e);
      const detail = e.response?.data?.detail || e.message || 'Erreur inconnue';
      alert(`Suppression impossible : ${detail}`);
    }
  };
  const toggleField = async (id, field, value) => { try { await API.patch(`/sessions/${id}/toggle`, { field, value }); loadData(); } catch (e) { console.error(e); } };

  // ---- Drop an activity from "À programmer" sidebar onto a day column ----
  const dropActivityOnDay = async (act, promoId, dayStr) => {
    if (!isAdmin || !act) return;
    // Validate: activity promotion must match the target column promotion
    if (act.promotion_id && promoId && promoId !== 'all' && act.promotion_id !== promoId) {
      alert(`Impossible : cette séquence concerne la promotion "${promoMap[act.promotion_id]?.nom || '?'}" et vous l'avez déposée sur "${promoMap[promoId]?.nom || '?'}".`);
      setDragActivite(null); setDragOverDay(null);
      return;
    }
    // Validate: activity semestre must match the active semestre filter (if any concrete S1..S6)
    if (filterSemestre !== 'all' && !['pair', 'impair'].includes(filterSemestre)
        && act.semestre && act.semestre !== filterSemestre) {
      alert(`Impossible : cette séquence est en ${act.semestre} alors que le planning affiche ${filterSemestre}.`);
      setDragActivite(null); setDragOverDay(null);
      return;
    }
    try {
      const heures = parseFloat(act.heures) || 2;
      const heDeb = '08:00';
      const endHour = Math.min(8 + Math.max(1, Math.ceil(heures)), 18);
      const payload = {
        date: dayStr,
        heure_debut: heDeb,
        heure_fin: `${String(endHour).padStart(2, '0')}:00`,
        type_activite_id: act.type_activite_id || '',
        intitule: act.nom || '',
        promotion_id: promoId !== 'all' ? promoId : (act.promotion_id || ''),
        ue_id: act.ue_id || '',
        semestre: act.semestre || '',
        formateur_ids: act.formateur_ids || [],
        group_id: '', site_id: '', statut: 'Prevu', saisi: false, commentaire: '',
      };
      const { data: sess } = await API.post('/sessions', payload);
      if (act.fiche_id && act.activite_id) {
        try { await API.post(`/fiches-projet/${act.fiche_id}/activites/${act.activite_id}/link-session`, { session_id: sess.id }); } catch (e) { console.error(e); }
      }
      setDragActivite(null); setDragOverDay(null);
      loadData();
    } catch (e) { console.error(e); setDragActivite(null); setDragOverDay(null); }
  };

  // Check whether an activity is droppable on a target promo/semestre column (used to highlight valid zones)
  const isDropAllowed = (act, promoId) => {
    if (!act) return false;
    if (act.promotion_id && promoId && promoId !== 'all' && act.promotion_id !== promoId) return false;
    if (filterSemestre !== 'all' && !['pair', 'impair'].includes(filterSemestre) && act.semestre && act.semestre !== filterSemestre) return false;
    return true;
  };

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
          group_id: '', ue_id: '', semestre: '', formateur_ids: [], joker_formateur_ids: [], site_id: '', statut: 'Prevu', saisi: false, commentaire: '', intitule: ''
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
    const sGroupIds = s.group_ids || (s.group_id ? [s.group_id] : []);
    const grpLabel = sGroupIds.map(gid => grpMap[gid]?.libelle).filter(Boolean).join(', ');
    const formInits = (s.formateur_ids || []).map(fid => fmMap[fid]?.initiales || '?').join(', ');
    const isDragging = dragInfo?.sessionId === s.id;
    const fontInit = Math.round(11 * zoom);

    return (
      <div key={s.id} data-testid={`session-block-${s.id}`}
        draggable={isAdmin}
        onDragStart={(e) => {
          if (!isAdmin) return;
          e.stopPropagation();
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', s.id);
          setDraggingSession(s);
          setHoveredSession(null);
        }}
        onDragEnd={() => { setDraggingSession(null); setDragOverSidebar(false); }}
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
          <span className="font-bold" style={{ color: at.couleur, fontSize: baseFontBlock + 1 }}>{at.nom}</span>
          {ue.code_ue && <span className="text-slate-600 dark:text-slate-300 font-semibold" style={{ fontSize: baseFontSmall + 1 }}>{ue.code_ue}</span>}
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
        {s.intitule && <div className="truncate text-slate-700 dark:text-slate-200 font-medium" style={{ fontSize: baseFontSmall + 1 }}>{s.intitule}</div>}
        <div className="text-slate-500 truncate" style={{ fontSize: baseFontSmall }} title={`${s.heure_debut}-${s.heure_fin}${grpLabel ? ' · ' + grpLabel : ''}`}>{s.heure_debut}-{s.heure_fin}{grpLabel ? ` · ${grpLabel}` : ''}</div>
        <div className="font-bold text-blue-700 dark:text-blue-300 truncate" style={{ fontSize: fontInit }} title={formInits}>{formInits}</div>
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
    const siteIds = s.site_ids || (s.site_id ? [s.site_id] : []);
    const siteNames = siteIds.map(sid => siteMap[sid]?.nom).filter(Boolean);
    const tGroupIds = s.group_ids || (s.group_id ? [s.group_id] : []);
    const grpLabel = tGroupIds.map(gid => grpMap[gid]?.libelle).filter(Boolean).join(', ');
    const forms = (s.formateur_ids || []).map(fid => fmMap[fid]).filter(Boolean);
    const dur = ((timeToMin(s.heure_fin || '00:00') - timeToMin(s.heure_debut || '00:00')) / 60).toFixed(1);
    const promoShort = promo.nom ? (promo.nom.match(/P\d+/)?.[0] || promo.nom.replace('Promotion ', '')) : '';
    const yearLabel = promo.annee_debut && promo.annee_fin ? `${promo.annee_debut}-${promo.annee_fin}` : '';
    return (
      <div className="fixed z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl px-5 py-4 w-[360px] tooltip-enter pointer-events-none"
        style={{ left: tooltipPos.x, top: tooltipPos.y }}>
        {/* UE Big title with vertical color bar */}
        {(ue.code_ue || s.intitule) && (
          <div className="flex items-start gap-3 mb-3 pb-3 border-b border-slate-200 dark:border-slate-700">
            <div className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: at.couleur || '#E97451' }} />
            <div className="flex-1 min-w-0">
              {ue.code_ue && <div className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">UE {ue.code_ue} — {s.intitule || ue.intitule}</div>}
              {!ue.code_ue && s.intitule && <div className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">{s.intitule}</div>}
            </div>
          </div>
        )}
        {/* Type */}
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: at.couleur || '#E97451' }} />
          <span className="text-sm font-semibold" style={{ color: at.couleur || '#E97451' }}>{at.nom}</span>
          {at.description && at.description !== at.nom && <span className="text-sm text-slate-500">— {at.description}</span>}
        </div>
        {/* Time */}
        <div className="flex items-center gap-3 mb-3 text-sm text-slate-700 dark:text-slate-300">
          <Clock size={16} className="text-slate-400 flex-shrink-0" />
          <span className="font-medium">{s.heure_debut} – {s.heure_fin}</span>
          <span className="text-slate-400">({dur}h)</span>
        </div>
        {/* Formateurs en colonne */}
        {forms.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {forms.map((f, i) => {
              const isJoker = (s.joker_formateur_ids || []).includes(f.id);
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold flex-shrink-0 ${isJoker ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 ring-2 ring-amber-400' : 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'}`}>{f.initiales}</span>
                  <span className="text-sm text-slate-800 dark:text-slate-100">{f.prenom} {f.nom?.toUpperCase()}</span>
                  {isJoker && <span className="text-amber-600 dark:text-amber-300 text-xs font-semibold" title="Formateur joker / remplaçant">★ joker</span>}
                </div>
              );
            })}
          </div>
        )}
        {/* Promotion */}
        {promo.nom && (
          <div className="flex items-center gap-3 mb-2 text-sm text-slate-700 dark:text-slate-300">
            <GraduationCap size={16} className="text-slate-400 flex-shrink-0" />
            <span>{promoShort}{yearLabel ? ` — ${yearLabel}` : ''}</span>
            {grpLabel && <span className="text-slate-500">· {grpLabel}</span>}
          </div>
        )}
        {/* Lieu(x) */}
        {siteNames.length > 0 && (
          <div className="flex items-center gap-3 mb-2 text-sm text-slate-700 dark:text-slate-300">
            <MapPin size={16} className="text-slate-400 flex-shrink-0" />
            <span>{siteNames.join(', ')}</span>
          </div>
        )}
        {/* Domaine */}
        {dom.nom && (
          <div className="flex items-start gap-3 mb-2 text-sm text-slate-700 dark:text-slate-300">
            <span className="inline-block w-4 h-4 rounded-sm flex-shrink-0 mt-0.5 ring-1 ring-black/5" style={{ backgroundColor: getDomainColor(dom) }} data-testid="tooltip-domain-color" />
            <span className="leading-tight">{dom.nom}</span>
          </div>
        )}
        {/* Status pill */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-700 flex gap-1.5 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full ${s.statut === 'Valide' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
            {s.statut === 'Valide' ? 'Validé' : 'Prévu'}
          </span>
          {s.saisi && <span className="text-xs px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">Saisi</span>}
          {s.commentaire && <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 truncate max-w-[200px]">💬 {s.commentaire}</span>}
        </div>
      </div>
    );
  };

  // Compute weekly hours per group (student POV) for a promotion
  const computeStudentHours = (promoId) => {
    if (!promoId || promoId === 'all') return null;
    const weekDates = new Set(allWeekDays.map(d => format(d, 'yyyy-MM-dd')));
    const weekSessions = sessions.filter(s => s.promotion_id === promoId && weekDates.has(s.date));
    if (weekSessions.length === 0) return null;
    // Identify TA (temps d'appropriation) activity type
    const isTAType = (typeId) => {
      const at = atMap[typeId];
      if (!at) return false;
      const n = (at.nom || '').toLowerCase().trim();
      return n === 'ta' || (at.description || '').toLowerCase().includes('appropriation');
    };
    // Identify SIMU (simulation) activity type
    const isSimuType = (typeId) => {
      const at = atMap[typeId];
      if (!at) return false;
      const n = (at.nom || '').toLowerCase().trim();
      return n === 'si' || n === 'simu' || n === 'simulation' || (at.description || '').toLowerCase().includes('simulation');
    };
    // For each group 1..8, compute total hours from a student's POV
    const result = [];
    for (let g = 1; g <= 8; g++) {
      const laneA = 2 * (g - 1), laneB = 2 * (g - 1) + 1;
      // Filter sessions that concern this student (promo entière OR group_ids covers laneA or laneB)
      const studentSessions = weekSessions.filter(s => {
        const gids = s.group_ids || (s.group_id ? [s.group_id] : []);
        if (gids.length === 0) return true; // Promo entière
        // Get lanes covered by this session
        const lanes = new Set();
        for (const gid of gids) {
          const grp = groups.find(x => x.id === gid);
          if (grp) groupToLanes(grp.libelle).forEach(l => lanes.add(l));
        }
        return lanes.has(laneA) || lanes.has(laneB);
      });
      // Deduplicate parallel sessions:
      // - SIMU (1/32) : on dedup sur (date, heure_debut, heure_fin) car plusieurs sous-groupes SIMU en parallèle = 1 seul créneau étudiant
      // - Sous-groupes lettrés (1/16, ex: 5a/5b) : dedup sur (date, intitulé, type) pour ne pas compter 2 fois une même activité scindée sur 2 créneaux
      // - Autres : dedup classique (date, heure_debut, intitule, type)
      const LETTER_SUB = /^\d+[a-z]$/i;
      const seenKeys = new Set();
      let total = 0, totalTA = 0;
      for (const s of studentSessions) {
        const isSimu = isSimuType(s.type_activite_id);
        const sgids = s.group_ids || (s.group_id ? [s.group_id] : []);
        const hasLetterSub = sgids.some(gid => {
          const grp = groups.find(x => x.id === gid);
          return grp && LETTER_SUB.test((grp.libelle || '').trim());
        });
        let key;
        if (isSimu) {
          key = `SIMU|${s.date}|${s.heure_debut}|${s.heure_fin}`;
        } else if (hasLetterSub) {
          key = `SUB|${s.date}|${(s.intitule || '').toLowerCase().trim()}|${s.type_activite_id || ''}`;
        } else {
          key = `${s.date}|${s.heure_debut}|${(s.intitule || '').toLowerCase().trim()}|${s.type_activite_id || ''}`;
        }
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        const dur = parseFloat(s.duree) || ((timeToMin(s.heure_fin || '00:00') - timeToMin(s.heure_debut || '00:00')) / 60);
        total += dur;
        if (isTAType(s.type_activite_id)) totalTA += dur;
      }
      result.push({ groupe: g, total, ta: totalTA });
    }
    return result;
  };

  const PromoGrid = ({ promoId, promoName }) => {
    const promoSessions = (promoId === 'all' ? sessions : sessions.filter(s => s.promotion_id === promoId))
      .filter(s => filterFormateur === 'all' ? true : (s.formateur_ids || []).includes(filterFormateur))
      .filter(s => filterType === 'all' ? true : s.type_activite_id === filterType)
      .filter(s => filterUE === 'all' ? true : s.ue_id === filterUE);
    const studentHours = computeStudentHours(promoId);
    return (
      <Card className="overflow-hidden">
        {promoName && (
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50 border-b" style={{ fontSize: 13 * zoom }}>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold">{promoName}</span>
              {studentHours && (
                <div className="flex flex-wrap gap-1" data-testid={`student-hours-${promoId}`}>
                  {studentHours.map(h => (
                    <span key={h.groupe} className={`text-[10px] px-1.5 py-0.5 rounded ${h.total > 0 ? 'bg-[#FFF1E8] text-[#E97451] border border-[#F8DBC2]' : 'bg-slate-100 dark:bg-slate-700/50 text-slate-400'}`}
                      title={`Groupe ${h.groupe} : ${h.total.toFixed(1)}h${h.ta > 0 ? ` dont TA: ${h.ta.toFixed(1)}h` : ''}`}>
                      <span className="font-semibold">G{h.groupe}</span> {h.total.toFixed(h.total % 1 === 0 ? 0 : 1)}h
                      {h.ta > 0 && <span className="opacity-80"> · TA {h.ta.toFixed(h.ta % 1 === 0 ? 0 : 1)}h</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <div className="grid" style={{ gridTemplateColumns: `${Math.round(50 * zoom)}px repeat(${nbDays}, 1fr)`, minWidth: Math.round((100 + nbDays * 130) * zoom) }}>
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
              const vacanceNom = vacancesByPromo[promoId]?.[dayStr];
              const daySessions = promoSessions.filter(s => s.date === dayStr).sort((a, b) => a.heure_debut.localeCompare(b.heure_debut));
              return (
                <div key={di} className={`border-r border-slate-200 dark:border-slate-700 relative overflow-hidden ${ferie ? 'bg-purple-50/40 dark:bg-purple-950/10' : ''} ${vacanceNom ? 'bg-orange-50/60 dark:bg-orange-950/20' : ''} ${dragOverDay === `${promoId}|${dayStr}` ? 'ring-2 ring-violet-400 ring-inset bg-violet-50/40' : ''} ${dragActivite && !isDropAllowed(dragActivite, promoId) ? 'opacity-50' : ''}`} style={{ height: GRID_H }}
                  data-day={dayStr}
                  onMouseDown={(e) => handleGridMouseDown(e, dayStr)}
                  onDragOver={(e) => { if (dragActivite && isDropAllowed(dragActivite, promoId)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverDay(`${promoId}|${dayStr}`); } }}
                  onDragLeave={() => { if (dragActivite && dragOverDay === `${promoId}|${dayStr}`) setDragOverDay(null); }}
                  onDrop={(e) => { if (dragActivite && isDropAllowed(dragActivite, promoId)) { e.preventDefault(); dropActivityOnDay(dragActivite, promoId, dayStr); } }}>
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
                  {(() => {
                    // ---- iter13 : packing horizontal sans chevauchement, ratio préservé ----
                    // Pour chaque session, on calcule sa LARGEUR cible (basée sur le nombre de lanes occupées
                    // par ses groupes) et sa POSITION préférée (par lane minimum). Puis on place les sessions
                    // côte à côte en partant de leur position préférée, en décalant à droite si chevauchement,
                    // tout en préservant le ratio de largeur.
                    const items = daySessions.map(s => {
                      const groupIds = s.group_ids || (s.group_id ? [s.group_id] : []);
                      if (!groupIds.length) return { s, widthPct: 100, preferredLeft: 0 };
                      const lanes = new Set();
                      for (const gid of groupIds) {
                        const g = groups.find(x => x.id === gid);
                        if (g) groupToLanes(g.libelle).forEach(l => lanes.add(l));
                      }
                      if (lanes.size === 0) return { s, widthPct: 100, preferredLeft: 0 };
                      const arr = Array.from(lanes).sort((a, b) => a - b);
                      const widthPct = (arr.length / 16) * 100;
                      const min = arr[0], max = arr[arr.length - 1];
                      const contiguous = (max - min + 1) === arr.length;
                      let preferredLeft;
                      if (contiguous) preferredLeft = (min / 16) * 100;
                      else {
                        const lc = arr.filter(l => l < 8).length;
                        const rc = arr.length - lc;
                        preferredLeft = lc >= rc ? 0 : 100 - widthPct;
                      }
                      return { s, widthPct, preferredLeft };
                    });
                    // BFS clusters (sessions overlapping in time)
                    const N = items.length;
                    const cluster = new Array(N).fill(-1);
                    let cn = 0;
                    for (let i = 0; i < N; i++) {
                      if (cluster[i] !== -1) continue;
                      cluster[i] = cn;
                      const stack = [i];
                      while (stack.length) {
                        const cur = stack.pop();
                        const aSt = timeToMin(items[cur].s.heure_debut), aEn = timeToMin(items[cur].s.heure_fin);
                        for (let j = 0; j < N; j++) {
                          if (cluster[j] !== -1) continue;
                          const bSt = timeToMin(items[j].s.heure_debut), bEn = timeToMin(items[j].s.heure_fin);
                          if (bSt < aEn && bEn > aSt) { cluster[j] = cn; stack.push(j); }
                        }
                      }
                      cn++;
                    }
                    // For each cluster, find max simultaneous width sum → scale down if > 100%
                    const placements = new Map();
                    for (let c = 0; c < cn; c++) {
                      const members = items.map((it, i) => ({ it, i })).filter(x => cluster[x.i] === c);
                      let maxSum = 0;
                      for (const m of members) {
                        const aSt = timeToMin(m.it.s.heure_debut), aEn = timeToMin(m.it.s.heure_fin);
                        let sum = 0;
                        for (const o of members) {
                          const oSt = timeToMin(o.it.s.heure_debut), oEn = timeToMin(o.it.s.heure_fin);
                          if (oSt < aEn && oEn > aSt) sum += o.it.widthPct;
                        }
                        maxSum = Math.max(maxSum, sum);
                      }
                      const scale = maxSum > 100 ? 100 / maxSum : 1;
                      // Sort: start time asc, widthPct desc (wider first), preferredLeft asc
                      members.sort((a, b) => {
                        const dt = timeToMin(a.it.s.heure_debut) - timeToMin(b.it.s.heure_debut);
                        if (dt !== 0) return dt;
                        if (a.it.widthPct !== b.it.widthPct) return b.it.widthPct - a.it.widthPct;
                        return a.it.preferredLeft - b.it.preferredLeft;
                      });
                      for (const m of members) {
                        const A = m.it;
                        const aSt = timeToMin(A.s.heure_debut), aEn = timeToMin(A.s.heure_fin);
                        const scaledWidth = A.widthPct * scale;
                        const scaledPref = A.preferredLeft * scale;
                        // Build list of BLOCKED intervals from time-overlapping placed siblings
                        const blocked = [];
                        for (const o of members) {
                          const p = placements.get(o.it.s.id);
                          if (!p) continue;
                          const oSt = timeToMin(o.it.s.heure_debut), oEn = timeToMin(o.it.s.heure_fin);
                          if (oSt < aEn && oEn > aSt) blocked.push({ left: p.left, right: p.left + p.width });
                        }
                        blocked.sort((a, b) => a.left - b.left);
                        // Build FREE gaps in [0..100]
                        const gaps = [];
                        let cursor = 0;
                        for (const b of blocked) {
                          if (b.left > cursor + 0.05) gaps.push({ left: cursor, width: b.left - cursor });
                          cursor = Math.max(cursor, b.right);
                        }
                        if (cursor < 99.95) gaps.push({ left: cursor, width: 100 - cursor });
                        // Choose the best gap : prefer one that contains preferredLeft and fits scaledWidth ;
                        // else the gap closest to preferredLeft that fits ; else the largest gap (shrink)
                        const fitting = gaps.filter(g => g.width >= scaledWidth - 0.05);
                        let target = null;
                        if (fitting.length) {
                          target = fitting.find(g => g.left <= scaledPref + 0.05 && scaledPref + scaledWidth <= g.left + g.width + 0.05);
                          if (!target) target = fitting.slice().sort((a, b) => Math.abs(a.left - scaledPref) - Math.abs(b.left - scaledPref))[0];
                        } else if (gaps.length) {
                          target = gaps.slice().sort((a, b) => b.width - a.width)[0];
                        } else {
                          target = { left: 0, width: scaledWidth };
                        }
                        // Position within chosen gap
                        const minLeft = target.left;
                        const maxLeft = target.left + target.width - scaledWidth;
                        const actualLeft = Math.max(minLeft, Math.min(scaledPref, maxLeft));
                        const width = Math.min(scaledWidth, target.left + target.width - actualLeft);
                        placements.set(A.s.id, { left: Math.max(0, actualLeft), width: Math.max(0.8, width) });
                      }
                      // ---- iter15 : "expand to fill" — étire les blocs du cluster proportionnellement
                      // quand l'espace utilisé est < 100% (préserve les ratios entre eux). Cas user :
                      // 6 sessions sur 5a..7b s'étalent sur 37.5% → expand x2.67 → chacune ~16.67%, fill 100%.
                      // Ratios préservés : 1/2 promo + G3 (50+12.5=62.5%) → expand x1.6 → 80% + 20% (ratio 4:1).
                      {
                        let minLeft = 100, maxRight = 0;
                        for (const m of members) {
                          const p = placements.get(m.it.s.id);
                          if (!p) continue;
                          minLeft = Math.min(minLeft, p.left);
                          maxRight = Math.max(maxRight, p.left + p.width);
                        }
                        const used = maxRight - minLeft;
                        if (used > 0.5 && used < 99.5) {
                          const expand = 100 / used;
                          for (const m of members) {
                            const p = placements.get(m.it.s.id);
                            if (!p) continue;
                            p.left = (p.left - minLeft) * expand;
                            p.width = p.width * expand;
                          }
                        }
                      }
                    }
                    return daySessions.map(s => {
                      const isDragging = dragInfo?.sessionId === s.id;
                      const sTop = isDragging && dragPreview ? dragPreview.top : Math.max(0, (timeToMin(s.heure_debut) - START_MIN) * PX_PER_MIN);
                      const sHeight = isDragging && dragPreview ? dragPreview.height : Math.max(18 * zoom, (timeToMin(s.heure_fin) - timeToMin(s.heure_debut)) * PX_PER_MIN);
                      const p = placements.get(s.id) || { left: 0, width: 100 };
                      return (
                        <div key={s.id} className={`absolute px-0.5 ${isDragging ? 'z-50' : 'z-[15]'}`}
                          style={{ top: sTop, height: sHeight, width: `${p.width}%`, left: `${p.left}%` }}>
                          {renderBlock(s)}
                        </div>
                      );
                    });
                  })()}
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
          <span className="text-sm font-semibold px-2"><span className="font-bold text-base">S{weekNum}</span> - {format(allWeekDays[0], "d MMM", { locale: fr })} au {format(allWeekDays[4], "d MMM yyyy", { locale: fr })}</span>
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
        <Select value={filterUE} onValueChange={setFilterUE}>
          <SelectTrigger className="w-44 h-8 text-xs" data-testid="filter-ue"><SelectValue placeholder="UE" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Toutes les UE</SelectItem>
            {ues.slice().sort((a, b) => (a.code_ue || '').localeCompare(b.code_ue || '')).map(u => (
              <SelectItem key={u.id} value={u.id}>{u.code_ue} — {u.intitule}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterFormateur} onValueChange={setFilterFormateur}>
          <SelectTrigger className="w-44 h-8 text-xs" data-testid="filter-formateur"><SelectValue placeholder="Formateur" /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">Tous les formateurs</SelectItem>
            {formateurs.map(f => <SelectItem key={f.id} value={f.id}>{f.initiales} - {f.prenom} {f.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36 h-8 text-xs" data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {actTypes.map(a => <SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant={sideByView ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setSideByView(!sideByView)} data-testid="toggle-side-by-side">
          <Columns size={14} className="mr-1" /> Cote a cote
        </Button>
        <Button variant={showSidebar ? "default" : "outline"} size="sm" className="h-8 text-xs" onClick={() => setShowSidebar(s => !s)} data-testid="toggle-sidebar-aprog">
          <ListTodo size={14} className="mr-1" /> {showSidebar ? 'Masquer à programmer' : 'Afficher à programmer'}
        </Button>
        {isAdmin && <Button size="sm" className="h-8 text-xs" onClick={() => startNew(format(new Date(), 'yyyy-MM-dd'))} data-testid="new-session-btn"><Plus size={14} className="mr-1" /> Nouvelle</Button>}
      </div>

      {/* Day selector */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-slate-500 font-medium mr-1">Jours :</span>
        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'].map((label, i) => {
          const active = selectedDayIdxs.includes(i);
          return (
            <button key={i}
              onClick={() => {
                setSelectedDayIdxs(prev => {
                  if (prev.includes(i)) {
                    const next = prev.filter(x => x !== i);
                    return next.length === 0 ? [0, 1, 2, 3, 4] : next;
                  }
                  return [...prev, i];
                });
              }}
              className={`px-2.5 py-1 rounded text-[11px] font-medium border transition-colors
                ${active ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent' : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'}`}
              data-testid={`day-toggle-${i}`}>
              {label}
            </button>
          );
        })}
        <Button variant="ghost" size="sm" className="h-7 text-[11px] ml-1" onClick={() => setSelectedDayIdxs([0, 1, 2, 3, 4])} data-testid="day-all">Tous</Button>
        <span className="text-[10px] text-slate-400 ml-2">{nbDays} jour{nbDays > 1 ? 's' : ''} affiché{nbDays > 1 ? 's' : ''}</span>
      </div>

      {/* Layout: sidebar À programmer + planning grids */}
      <div className="flex gap-3 items-start">
        {/* Sidebar with drop-to-deprogram + draggable pills grouped by promo */}
        {showSidebar && (
        <Card className="w-80 flex-shrink-0 sticky top-2 self-start max-h-[calc(100vh-180px)] overflow-y-auto" data-testid="a-programmer-sidebar-global"
          onDragOver={(e) => { if (dragingSession) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverSidebar(true); } }}
          onDragLeave={() => setDragOverSidebar(false)}
          onDrop={async (e) => {
            e.preventDefault(); setDragOverSidebar(false);
            if (!dragingSession || !isAdmin) return;
            try {
              await API.post(`/sessions/${dragingSession.id}/deprogrammer`);
              setDraggingSession(null);
              loadData();
            } catch (err) { console.error(err); setDraggingSession(null); }
          }}>
          <div className={`px-3 py-2 border-b bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between ${dragOverSidebar ? 'bg-rose-100 dark:bg-rose-950/30' : ''}`}>
            <div className="flex items-center gap-2">
              <ListTodo size={14} className="text-violet-600" />
              <span className="text-sm font-semibold">{dragOverSidebar ? 'Déposer pour déprogrammer' : 'Programmation des séances'}</span>
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-700 font-bold">{aProgrammer.length}</span>
          </div>
          <p className="px-3 py-1.5 text-[10px] text-slate-500 border-b">Glissez une pastille sur le planning pour planifier la séance.</p>
          {aProgrammer.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">Aucune séquence non programmée.</p>
          ) : (
            <div className="p-2 space-y-3">
              {/* Group by promotion */}
              {Object.entries(aProgrammer.reduce((acc, a) => {
                const pid = a.promotion_id || '_';
                (acc[pid] = acc[pid] || []).push(a);
                return acc;
              }, {})).map(([pid, items]) => {
                const promo = promoMap[pid] || {};
                const shortLabel = promo.code || (promo.nom || '').match(/P\d+/)?.[0] || (promo.nom || '?').replace('Promotion ', '').slice(0, 4);
                const yearLabel = promo.annee_debut && promo.annee_fin ? `${promo.annee_debut}-${promo.annee_fin}` : ((promo.nom || '').match(/\d{4}-\d{4}/)?.[0] || '');
                return (
                  <div key={pid} className="border border-slate-200 dark:border-slate-700 rounded-lg p-2 bg-slate-50/50 dark:bg-slate-800/30">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-blue-500 text-white text-[10px] font-bold whitespace-nowrap">{shortLabel}</span>
                      {yearLabel && <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{yearLabel}</span>}
                      <span className="text-[10px] text-slate-500 ml-auto">— {items.length} séance{items.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {items.map(a => {
                        const at = atMap[a.type_activite_id] || {};
                        const ue = ueMap[a.ue_id] || {};
                        const color = at.couleur || '#94a3b8';
                        return (
                          <div key={a.activite_id}
                            draggable={isAdmin}
                            onDragStart={(e) => {
                              setDragActivite(a);
                              if (e.dataTransfer) {
                                e.dataTransfer.effectAllowed = 'copy';
                                e.dataTransfer.setData('text/plain', a.activite_id);
                              }
                            }}
                            onDragEnd={() => { setDragActivite(null); setDragOverDay(null); }}
                            title={`${at.nom || ''} ${ue.code_ue || ''} — ${a.nom || ''} (${a.heures}h)${a.semaine_souhaitee ? ' · ' + a.semaine_souhaitee : ' · sans semaine'}`}
                            className="inline-flex flex-col items-center justify-center px-2.5 py-1.5 rounded-full border-2 cursor-grab active:cursor-grabbing hover:shadow-md transition text-center min-w-[60px]"
                            style={{ borderColor: color, backgroundColor: color + '20' }}
                            data-testid={`global-aprog-${a.activite_id}`}>
                            <span className="text-[10px] font-bold leading-tight" style={{ color }}>{at.nom || '?'}</span>
                            <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-200 leading-tight">{ue.code_ue || ''}</span>
                            <span className="text-[8px] text-slate-500 leading-tight">{a.heures}h{!a.semaine_souhaitee ? ' · à programmer' : ''}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        )}

        <div className="flex-1 min-w-0">
          {sideByView && displayPromos.length > 1 ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${displayPromos.length}, 1fr)` }}>
              {displayPromos.map(p => <PromoGrid key={p.id} promoId={p.id} promoName={p.nom} />)}
            </div>
          ) : (
            <div className="space-y-3">
              {displayPromos.map(p => <PromoGrid key={p.id} promoId={p.id} promoName={p.nom} />)}
            </div>
          )}
        </div>
      </div>

      {dragingSession && (
        <div className={`fixed top-3 left-1/2 -translate-x-1/2 z-[200] text-white px-4 py-2 rounded-lg shadow-xl text-sm font-medium ${dragOverSidebar ? 'bg-rose-600' : 'bg-violet-600'}`}>
          {dragOverSidebar ? 'Lâchez pour déprogrammer la séance' : 'Glissez sur "À programmer" pour déprogrammer'}
        </div>
      )}
      {dragActivite && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-violet-600 text-white px-4 py-2 rounded-lg shadow-xl text-sm font-medium">
          Déposez "{dragActivite.nom || 'la séquence'}" sur un jour du planning
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
                <Select value={editSession.type_activite_id||''} onValueChange={v=>{
                  // Auto-fill nb_formateurs_requis depuis la config Administration → Types d'activités
                  // Règle : TPG → 0 (exception), is_cours=true → 1, sinon → 0
                  const at = atMap[v] || actTypes.find(a => a.id === v) || {};
                  const nm = (at.nom || '').trim().toUpperCase();
                  const defReq = nm === 'TPG' ? 0 : (at.is_cours ? 1 : 0);
                  setEditSession(es => ({
                    ...es,
                    type_activite_id: v,
                    nb_formateurs_requis: (es.nb_formateurs_requis === undefined || es.nb_formateurs_requis === null || es.nb_formateurs_requis === '') ? defReq : es.nb_formateurs_requis,
                  }));
                }}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{actTypes.map(a=><SelectItem key={a.id} value={a.id}>{a.nom}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs">Promotion</Label>
                <Select value={editSession.promotion_id||''} onValueChange={v=>setEditSession({...editSession,promotion_id:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{promotions.map(p=><SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2"><Label className="text-xs">Groupes (multi-sélection)</Label>
                <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                  {!editSession.promotion_id ? (
                    <span className="text-[11px] text-slate-400 italic">Sélectionnez d'abord une promotion</span>
                  ) : (() => {
                    const currentIds = editSession.group_ids || (editSession.group_id ? [editSession.group_id] : []);
                    const promoGroups = groups.filter(g => !g.promotion_id || g.promotion_id === editSession.promotion_id);
                    const allSelected = currentIds.length === 0;
                    return (
                      <>
                        <button type="button"
                          className={`px-2 py-0.5 rounded border text-[11px] cursor-pointer font-medium ${allSelected ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-white border-slate-200 text-slate-600'}`}
                          onClick={() => setEditSession({ ...editSession, group_ids: [], group_id: '' })}
                          data-testid="session-group-all">
                          Promo entière
                        </button>
                        {promoGroups.map(g => {
                          const checked = currentIds.includes(g.id);
                          return (
                            <label key={g.id} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer
                              ${checked ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                              <input type="checkbox" className="w-3 h-3" checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked ? [...currentIds, g.id] : currentIds.filter(i => i !== g.id);
                                  setEditSession({ ...editSession, group_ids: next, group_id: next[0] || '' });
                                }} />
                              {g.libelle}
                            </label>
                          );
                        })}
                        {promoGroups.length === 0 && <span className="text-[11px] text-slate-400">Aucun groupe défini pour cette promotion</span>}
                        {currentIds.length > 0 && <span className="text-[10px] text-slate-500 ml-auto">{currentIds.length} groupe{currentIds.length > 1 ? 's' : ''} sélectionné{currentIds.length > 1 ? 's' : ''}</span>}
                      </>
                    );
                  })()}
                </div>
              </div>
              <div><Label className="text-xs">UE</Label>
                <Select value={editSession.ue_id||''} onValueChange={v=>setEditSession({...editSession,ue_id:v})}>
                  <SelectTrigger className="h-8 text-sm" data-testid="session-ue"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{ues.map(u=><SelectItem key={u.id} value={u.id}>{u.code_ue} - {u.intitule}</SelectItem>)}</SelectContent></Select>
                {/* Liste des séquences "à programmer" de la fiche projet pour cette UE+promo */}
                {editSession.ue_id && (() => {
                  const candidates = (aProgrammer || []).filter(a =>
                    a.ue_id === editSession.ue_id &&
                    (!editSession.promotion_id || !a.promotion_id || a.promotion_id === editSession.promotion_id)
                  );
                  if (candidates.length === 0) return null;
                  return (
                    <div className="mt-2 p-2 rounded border border-[#F8DBC2] bg-[#FFF1E8] dark:bg-amber-950/20">
                      <p className="text-[10px] font-semibold text-[#E97451] uppercase tracking-wider mb-1">Séquence à programmer (option)</p>
                      <Select value={editSession._linked_activite_id || ''} onValueChange={(v) => {
                        if (!v || v === '__none__') {
                          setEditSession({ ...editSession, _linked_activite_id: '' });
                          return;
                        }
                        const act = candidates.find(a => a.activite_id === v);
                        if (!act) return;
                        // Pre-fill : intitule, type, heures (durée), formateurs, groupes
                        const dur = parseFloat(act.heures) || (editSession.duree || 2);
                        const hd = editSession.heure_debut || '08:00';
                        const [hh, mm] = hd.split(':').map(Number);
                        const endMin = hh * 60 + mm + dur * 60;
                        const heFin = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;
                        setEditSession({
                          ...editSession,
                          _linked_activite_id: v,
                          _linked_fiche_id: act.fiche_id,
                          intitule: act.nom || editSession.intitule || '',
                          type_activite_id: act.type_activite_id || editSession.type_activite_id || '',
                          duree: dur,
                          heure_fin: heFin,
                          formateur_ids: (act.formateur_ids && act.formateur_ids.length) ? act.formateur_ids : editSession.formateur_ids,
                          group_ids: (act.group_ids && act.group_ids.length) ? act.group_ids : editSession.group_ids,
                        });
                      }}>
                        <SelectTrigger className="h-8 text-xs bg-white" data-testid="session-link-activite"><SelectValue placeholder={`${candidates.length} séquence(s) disponible(s)`} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Aucune (création libre)</SelectItem>
                          {candidates.map(a => {
                            const at = atMap[a.type_activite_id];
                            return (
                              <SelectItem key={a.activite_id} value={a.activite_id}>
                                {at?.nom || '?'} · {a.nom || '(sans intitulé)'} · {a.heures}h{a.semaine_souhaitee ? ` · ${a.semaine_souhaitee}` : ''}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
              <div><Label className="text-xs">Semestre</Label>
                <Select value={editSession.semestre||''} onValueChange={v=>setEditSession({...editSession,semestre:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>{["S1","S2","S3","S4","S5","S6"].map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
              <div className="col-span-2">
                {(() => {
                  const ids = editSession.site_ids || (editSession.site_id ? [editSession.site_id] : []);
                  const summary = ids.length === 0
                    ? 'Aucune salle'
                    : ids.map(id => sites.find(s => s.id === id)?.nom).filter(Boolean).join(', ');
                  return (
                    <>
                      <button type="button" onClick={() => setShowSiteSection(v => !v)}
                        className="flex items-center justify-between w-full px-2 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
                        data-testid="toggle-site-section">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Salle(s) <span className="text-slate-400 font-normal ml-1.5">· {summary}</span></span>
                        <span className="text-slate-400 text-[10px]">{showSiteSection ? '▾ masquer' : '▸ afficher'}</span>
                      </button>
                      {showSiteSection && (
                        <div className="flex flex-wrap gap-1.5 mt-2 items-center" data-testid="session-sites">
                          <button type="button"
                            className={`px-2 py-0.5 rounded border text-[11px] font-medium ${ids.length === 0 ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-slate-200 text-slate-500'}`}
                            onClick={() => setEditSession({ ...editSession, site_ids: [], site_id: '' })}>
                            Aucune salle
                          </button>
                          {sites.map(s => {
                            const checked = ids.includes(s.id);
                            return (
                              <label key={s.id} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer
                                ${checked ? 'bg-slate-200 dark:bg-slate-700 border-slate-400' : 'border-slate-200 dark:border-slate-700'}`}>
                                <input type="checkbox" className="w-3 h-3" checked={checked}
                                  onChange={e => {
                                    const next = e.target.checked ? [...ids, s.id] : ids.filter(i => i !== s.id);
                                    setEditSession({ ...editSession, site_ids: next, site_id: next[0] || '' });
                                  }} />
                                {s.nom}
                              </label>
                            );
                          })}
                          {ids.length > 0 && <span className="text-[10px] text-slate-500 ml-auto">{ids.length} sélectionnée{ids.length > 1 ? 's' : ''}</span>}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              <div><Label className="text-xs">Statut</Label>
                <Select value={editSession.statut||'Prevu'} onValueChange={v=>setEditSession({...editSession,statut:v})}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Prevu">Prevu</SelectItem><SelectItem value="Valide">Valide</SelectItem></SelectContent></Select></div>
              <div className="col-span-2"><Label className="text-xs">Formateurs</Label>
                {(() => {
                  const ids = editSession.formateur_ids || [];
                  const req = editSession.nb_formateurs_requis;
                  const reqNum = (req === undefined || req === null || req === '') ? null : parseInt(req, 10);
                  const have = ids.length;
                  const incomplete = reqNum !== null && have < reqNum;
                  const overflow = reqNum !== null && have > reqNum;
                  return (
                    <div className="flex items-center gap-2 mt-1 mb-1">
                      <span className="text-[11px] text-slate-500">Requis :</span>
                      <Input type="number" min="0" max="20" value={req ?? ''}
                        onChange={e => setEditSession({ ...editSession, nb_formateurs_requis: e.target.value === '' ? null : parseInt(e.target.value, 10) })}
                        className="h-7 w-16 text-xs"
                        data-testid="nb-formateurs-requis-input" />
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded border ${incomplete ? 'bg-red-50 border-red-300 text-red-700' : overflow ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-emerald-50 border-emerald-300 text-emerald-700'}`}
                            data-testid="nb-formateurs-count">
                        {have} / {reqNum ?? '?'} {incomplete ? '⚠ incomplet' : overflow ? '+ surnombre' : reqNum !== null ? '✓ complet' : ''}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-1.5 mt-1 items-center">
                  <button type="button"
                    className="px-2 py-0.5 rounded border text-[11px] cursor-pointer bg-blue-50 hover:bg-blue-100 border-blue-300 text-blue-700 font-medium"
                    onClick={() => {
                      const allIds = formateurs.map(f => f.id);
                      const cur = editSession.formateur_ids || [];
                      const same = cur.length === allIds.length && cur.every(id => allIds.includes(id));
                      setEditSession({ ...editSession, formateur_ids: same ? [] : allIds, joker_formateur_ids: same ? [] : (editSession.joker_formateur_ids || []) });
                    }}
                    data-testid="select-all-formateurs">
                    {((editSession.formateur_ids||[]).length === formateurs.length && formateurs.length>0) ? 'Tout deselectionner' : 'Tous les formateurs'}
                  </button>
                  <span className="text-[10px] text-slate-500 ml-2">Clic : ✓ sélection · clic 2 : ★ joker · clic 3 : retirer</span>
                  {formateurs.map(f=>{
                    const ids = editSession.formateur_ids || [];
                    const jokers = editSession.joker_formateur_ids || [];
                    const isSel = ids.includes(f.id);
                    const isJoker = jokers.includes(f.id);
                    const cycle = () => {
                      if (!isSel) {
                        // 0 -> 1 (selected)
                        setEditSession({ ...editSession, formateur_ids: [...ids, f.id], joker_formateur_ids: jokers.filter(i => i !== f.id) });
                      } else if (!isJoker) {
                        // 1 -> 2 (joker)
                        setEditSession({ ...editSession, formateur_ids: ids, joker_formateur_ids: [...jokers, f.id] });
                      } else {
                        // 2 -> 0 (deselect)
                        setEditSession({ ...editSession, formateur_ids: ids.filter(i => i !== f.id), joker_formateur_ids: jokers.filter(i => i !== f.id) });
                      }
                    };
                    const cls = isJoker
                      ? 'bg-amber-200 dark:bg-amber-700/50 border-amber-500 text-amber-900 dark:text-amber-100 font-semibold'
                      : isSel
                        ? 'bg-slate-200 dark:bg-slate-700 border-slate-400'
                        : 'border-slate-200 dark:border-slate-700';
                    return (
                      <button key={f.id} type="button" onClick={cycle}
                        title={isJoker ? 'Joker (remplaçant/secours)' : isSel ? 'Sélectionné' : 'Non sélectionné'}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] cursor-pointer ${cls}`}
                        data-testid={`formateur-toggle-${f.id}`}>
                        {isJoker && <span className="text-amber-700 dark:text-amber-300">★</span>}
                        {!isJoker && isSel && <span className="text-slate-500">✓</span>}
                        {f.initiales} - {f.prenom} {f.nom}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="col-span-2 flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs"><Checkbox checked={editSession.saisi||false} onCheckedChange={v=>setEditSession({...editSession,saisi:v})}/>Saisi</label></div>
              <div className="col-span-2"><Label className="text-xs">Commentaire</Label><Input value={editSession.commentaire||''} onChange={e=>setEditSession({...editSession,commentaire:e.target.value})} className="h-8 text-sm"/></div>
              <div className="col-span-2 flex justify-between pt-2 border-t">
                <div className="flex gap-2">{editSession.id&&(<>
                  <Button variant="outline" size="sm" className="text-xs" onClick={()=>duplicateSession(editSession.id)}>Dupliquer</Button>
                  <Button variant="destructive" size="sm" className={`text-xs ${confirmDelete ? 'animate-pulse ring-2 ring-red-500' : ''}`} onClick={()=>deleteSession(editSession.id)} data-testid="del-session">
                    {confirmDelete ? 'Confirmer la suppression ?' : 'Supprimer'}
                  </Button></>)}</div>
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
