/**
 * notifications.test.mjs
 * Tests for notification message building and guard logic.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sendNotifications } from '../lib/notifications.mjs';

describe('sendNotifications', () => {
  it('does nothing when telegram config is missing', async () => {
    // Should not throw
    await sendNotifications(
      { status: 'success', slug: 'test' },
      { notifications: {} }
    );
  });

  it('does nothing when botToken is empty', async () => {
    await sendNotifications(
      { status: 'success', slug: 'test' },
      { notifications: { telegram: { botToken: '', chatId: '123' } } }
    );
  });

  it('does nothing when chatId is missing', async () => {
    await sendNotifications(
      { status: 'success', slug: 'test' },
      { notifications: { telegram: { botToken: 'abc', chatId: '' } } }
    );
  });
});
