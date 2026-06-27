import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getBadgeIcon } from '../src/badge-icons.js';

test('badge icon mapping covers key badge themes', () => {
  assert.equal(getBadgeIcon('undefeated-10', 'Undefeated 10'), 'bi-shield-fill-check');
  assert.equal(getBadgeIcon('challenge-winner', 'Challenge Winner'), 'bi-trophy-fill');
  assert.equal(getBadgeIcon('host-organizer', 'Host Organizer'), 'bi-people-fill');
  assert.equal(getBadgeIcon('marathon-player', 'Marathon Player'), 'bi-lightning-charge-fill');
  assert.equal(getBadgeIcon('mystery-badge', 'Mystery Badge'), 'bi-patch-check-fill');
});
