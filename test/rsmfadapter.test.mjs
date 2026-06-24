import 'fake-indexeddb/auto';
import { test, describe, before } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import RsmfAdapter from '../js/rsmfadapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(__dirname, 'rsmf_manifest.json'), 'utf8'));

let adapter;

before(async () => {
  adapter = await RsmfAdapter.create(manifest, 'rsmf-test');
});

describe('RsmfAdapter', () => {

  describe('getParticipants', () => {
    test('returns all 12 participants', async () => {
      assert.strictEqual((await adapter.getParticipants()).length, 12);
    });
  });

  describe('getParticipantById', () => {
    test('returns known participant', async () => {
      const p = await adapter.getParticipantById('WGSJT8SKS');
      assert.strictEqual(p.display, 'whitney.payne');
      assert.strictEqual(p.email, 'whitney.payne@relativity.com');
    });

    test('returns undefined for unknown id', async () => {
      assert.strictEqual(await adapter.getParticipantById('NONEXISTENT'), undefined);
    });
  });

  describe('getConversations', () => {
    test('returns all 7 conversations (including virtual NONE for orphans)', async () => {
      assert.strictEqual((await adapter.getConversations()).length, 7);
    });
  });

  describe('getConversationById', () => {
    test('returns known conversation', async () => {
      const c = await adapter.getConversationById('CHAF1FWN5');
      assert.strictEqual(c.display, 'organization');
      assert.strictEqual(c.type, 'channel');
    });

    test('returns undefined for unknown id', async () => {
      assert.strictEqual(await adapter.getConversationById('NONEXISTENT'), undefined);
    });
  });

  describe('getConversationsByPlatform', () => {
    test('returns conversations for known platform', async () => {
      const convs = await adapter.getConversationsByPlatform('slack');
      assert.ok(convs.length > 0);
      convs.forEach(c => assert.strictEqual(c.platform, 'slack'));
    });

    test('returns empty array for unknown platform', async () => {
      assert.deepStrictEqual(await adapter.getConversationsByPlatform('teams'), []);
    });
  });

  describe('getConversationsByType', () => {
    test('returns conversations for known type', async () => {
      const convs = await adapter.getConversationsByType('channel');
      assert.ok(convs.length > 0);
      convs.forEach(c => assert.strictEqual(c.type, 'channel'));
    });

    test('returns empty array for unknown type', async () => {
      assert.deepStrictEqual(await adapter.getConversationsByType('dm'), []);
    });
  });

  describe('getEventById', () => {
    test('returns known event', async () => {
      const e = await adapter.getEventById('CHAF1FWN5_1554216835.0015');
      assert.strictEqual(e.type, 'message');
      assert.strictEqual(e.participant, 'WFJMFG763');
      assert.strictEqual(e.conversation, 'CHAF1FWN5');
    });

    test('returns undefined for unknown id', async () => {
      assert.strictEqual(await adapter.getEventById('NONEXISTENT'), undefined);
    });
  });

  describe('getEventsByConversationId', () => {
    test('returns events for CHAF1FWN5 (organization)', async () => {
      const events = await adapter.getEventsByConversationId('CHAF1FWN5');
      assert.strictEqual(events.length, 6);
      events.forEach(e => assert.strictEqual(e.conversation, 'CHAF1FWN5'));
    });

    test('returns all events when passed null (ALL)', async () => {
      const events = await adapter.getEventsByConversationId(null);
      assert.strictEqual(events.length, manifest.events.length);
    });

    test('returns empty array for unknown conversation', async () => {
      assert.deepStrictEqual(await adapter.getEventsByConversationId('NONEXISTENT'), []);
    });
  });

  describe('getRootEvents', () => {
    test('root events for CHAF1FWN5 have no parent', async () => {
      const roots = await adapter.getRootEvents('CHAF1FWN5');
      assert.ok(roots.length > 0);
      roots.forEach(e => assert.strictEqual(e.parent, RsmfAdapter.NONE));
    });

    test('root events for all conversations (null)', async () => {
      const roots = await adapter.getRootEvents(null);
      roots.forEach(e => assert.strictEqual(e.parent, RsmfAdapter.NONE));
    });
  });

  describe('getEventsByParentId', () => {
    test('returns children of a thread parent', async () => {
      const children = await adapter.getEventsByParentId('GHJQZ4YBH_1554216034.0059');
      assert.ok(children.length > 5);
      children.forEach(e => assert.strictEqual(e.parent, 'GHJQZ4YBH_1554216034.0059'));
    });

    test('returns empty for event with no children', async () => {
      assert.deepStrictEqual(await adapter.getEventsByParentId('CHAF1FWN5_1554216759.0009'), []);
    });

    test('returns all events when passed null (ALL)', async () => {
      const events = await adapter.getEventsByParentId(null);
      assert.strictEqual(events.length, manifest.events.length);
    });
  });

  describe('getEventsByParticipant', () => {
    test('returns events for a known participant', async () => {
      const events = await adapter.getEventsByParticipant('WFJMFG763');
      assert.ok(events.length > 0);
      events.forEach(e => assert.strictEqual(e.participant, 'WFJMFG763'));
    });

    test('returns empty array for unknown participant', async () => {
      assert.deepStrictEqual(await adapter.getEventsByParticipant('NONEXISTENT'), []);
    });
  });

  describe('getEvents (combined filter)', () => {
    test('parentId="" returns root events for conversation', async () => {
      const events = await adapter.getEvents('CHAF1FWN5', '');
      events.forEach(e => {
        assert.strictEqual(e.conversation, 'CHAF1FWN5');
        assert.strictEqual(e.parent, RsmfAdapter.NONE);
      });
    });

    test('parentId=null returns all events in conversation', async () => {
      const events = await adapter.getEvents('CHAF1FWN5', null);
      assert.strictEqual(events.length, 6);
    });

    test('specific parentId returns children regardless of conversationId arg', async () => {
      const children = await adapter.getEvents('ignored', 'GHJQZ4YBH_1554233489.0278');
      assert.strictEqual(children.length, 3);
      assert.strictEqual(children[0].body, 'first reply');
    });
  });

  describe('orphan events (no conversation)', () => {
    test('orphan event is accessible by id', async () => {
      const e = await adapter.getEventById('GHJQZ4YBH_1554220310.101');
      assert.strictEqual(e.body, "I'm an orphan");
      assert.strictEqual(e.conversation, RsmfAdapter.NONE);
    });

    test('orphan events appear in NONE conversation', async () => {
      const events = await adapter.getEventsByConversationId('');
      assert.ok(events.some(e => e.id === 'GHJQZ4YBH_1554220310.101'));
    });

    test('child of orphan inherits no conversation and is retrievable by parent', async () => {
      const children = await adapter.getEventsByParentId('GHJQZ4YBH_1554220310.101');
      assert.strictEqual(children.length, 1);
      assert.strictEqual(children[0].body, "I'm the child of an orphan");
    });

    test('getRootEvents with NONE returns orphan root events', async () => {
      const roots = await adapter.getRootEvents('');
      assert.ok(roots.some(e => e.id === 'GHJQZ4YBH_1554220310.101'));
      assert.ok(!roots.some(e => e.id === 'GHJQZ4YBH_1554220310.102'));
    });
  });

  describe('conversation inferred from parent', () => {
    test('event with no conversation but parent in CHAF1FWN5 gets an error', async () => {
      const e = await adapter.getEventById('CHILD_NO_CONV_001');
      assert.ok(e.errors?.length > 0, 'Expected errors on CHILD_NO_CONV_001');
      assert.ok(e.errors[0].includes('conversation:NONE'), 'Error should mention NONE conversation');
      assert.ok(e.errors[0].includes('conversation:CHAF1FWN5'), 'Error should mention parent conversation');
    });
  });

  describe('event ordering', () => {
    test('events are sorted by timestamp ascending', async () => {
      const events = await adapter.getEventsByConversationId(null);
      for (let i = 1; i < events.length; i++) {
        const t1 = Date.parse(events[i - 1].timestamp);
        const t2 = Date.parse(events[i].timestamp);
        assert.ok(t1 <= t2, `Event ${i} out of order: ${events[i-1].timestamp} > ${events[i].timestamp}`);
      }
    });
  });

  describe('getReplyCount', () => {
    test('returns count of replies to a parent', async () => {
      const count = await adapter.getReplyCount('GHJQZ4YBH_1554233489.0278');
      assert.strictEqual(count, 3);
    });

    test('returns 0 for event with no replies', async () => {
      const count = await adapter.getReplyCount('CHAF1FWN5_1554216759.0009');
      assert.strictEqual(count, 0);
    });
  });

  describe('static helpers', () => {
    test('parseTimestamp returns valid ms', () => {
      const ms = RsmfAdapter.parseTimestamp('2019-04-02T14:53:55.002Z');
      assert.strictEqual(ms, Date.parse('2019-04-02T14:53:55.002Z'));
    });

    test('parseTimestamp returns NaN for invalid input', () => {
      assert.ok(isNaN(RsmfAdapter.parseTimestamp('not-a-date')));
    });

    test('getStringOrNull returns string value', () => {
      assert.strictEqual(RsmfAdapter.getStringOrNull({ a: 'hello' }, 'a'), 'hello');
    });

    test('getStringOrNull returns null for non-string', () => {
      assert.strictEqual(RsmfAdapter.getStringOrNull({ a: 123 }, 'a'), null);
      assert.strictEqual(RsmfAdapter.getStringOrNull({}, 'a'), null);
    });
  });
});
