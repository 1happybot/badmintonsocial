function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

// Map badge slugs/names to Bootstrap Icons for a more expressive badge UI.
export function getBadgeIcon(slug, name = '') {
  const text = `${String(slug || '').toLowerCase()} ${String(name || '').toLowerCase()}`;

  if (matchesAny(text, [/undefeated/, /invincible/, /no[- ]?loss/])) return 'bi-shield-fill-check';
  if (matchesAny(text, [/winner/, /champ/, /champion/, /victory/, /trophy/])) return 'bi-trophy-fill';
  if (matchesAny(text, [/streak/, /fire/, /hot/])) return 'bi-fire';
  if (matchesAny(text, [/challenge/, /duel/])) return 'bi-flag-fill';
  if (matchesAny(text, [/match/, /marathon/, /grind/, /played/])) return 'bi-lightning-charge-fill';
  if (matchesAny(text, [/host/, /organizer/, /community/, /social/])) return 'bi-people-fill';
  if (matchesAny(text, [/elite/, /pro/, /master/, /legend/])) return 'bi-stars';

  return 'bi-patch-check-fill';
}
