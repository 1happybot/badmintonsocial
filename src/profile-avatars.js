export function getAvatarEmoji(style = 'smash') {
  const key = String(style || '').toLowerCase();
  const map = {
    smash: '🏸',
    lightning: '⚡',
    shield: '🛡️',
    fire: '🔥',
    ice: '❄️',
    comet: '☄️',
    rocket: '🚀',
    crown: '👑',
  };
  return map[key] || map.smash;
}

export function getAvatarClass(style = 'smash') {
  const key = String(style || '').toLowerCase();
  const allowed = new Set(['smash', 'lightning', 'shield', 'fire', 'ice', 'comet', 'rocket', 'crown']);
  return `avatar-theme-${allowed.has(key) ? key : 'smash'}`;
}
