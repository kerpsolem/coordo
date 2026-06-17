// Renvoie la classe CSS à appliquer aux SelectTrigger / Input pour indiquer
// qu'un filtre est actif (≠ 'all' / vide / null / undefined).
export const filterCls = (value, base = '') => {
  const isActive = value !== undefined && value !== null && value !== '' && value !== 'all';
  return [base, isActive ? 'filter-active' : ''].filter(Boolean).join(' ');
};
