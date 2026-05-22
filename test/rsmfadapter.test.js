const { test, describe } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const RsmfAdapter = require('../js/rsmfadapter.js');
const manifest = JSON.parse(readFileSync(join(__dirname, 'rsmf_manifest.json'), 'utf8'));

describe('RsmfAdapter', () => {
  let adapter;

  test('constructs without error', () => {
    adapter = new RsmfAdapter(manifest);
  });

  describe('getParticipants', () => {
    test('returns all 12 participants', () => {
      adapter = new RsmfAdapter(manifest);
      assert.strictEqual(adapter.getParticipants().length, 12);
    });
  });

  describe('getParticipantById', () => {
    test('returns known participant', () => {
      adapter = new RsmfAdapter(manifest);
      const p = adapter.getParticipantById('WGSJT8SKS');
      assert.strictEqual(p.display, 'whitney.payne');
      assert.strictEqual(p.email, 'whitney.payne@relativity.com');
    });

    test('returns undefined for unknown id', () => {
      adapter = new RsmfAdapter(manifest);
      assert.strictEqual(adapter.getParticipantById('NONEXISTENT'), undefined);
    });
  });

  describe('getConversations', () => {
    test('returns all 6 conversations', () => {
      adapter = new RsmfAdapter(manifest);
      assert.strictEqual(adapter.getConversations().length, 6);
    });
  });

  describe('getConversationById', () => {
    test('returns known conversation', () => {
      adapter = new RsmfAdapter(manifest);
      const c = adapter.getConversationById('CHAF1FWN5');
      assert.strictEqual(c.display, 'organization');
      assert.strictEqual(c.type, 'channel');
    });

    test('returns undefined for unknown id', () => {
      adapter = new RsmfAdapter(manifest);
      assert.strictEqual(adapter.getConversationById('NONEXISTENT'), undefined);
    });
  });

  describe('getEventById', () => {
    test('returns known event', () => {
      adapter = new RsmfAdapter(manifest);
      const e = adapter.getEventById('CHAF1FWN5_1554216835.0015');
      assert.strictEqual(e.type, 'message');
      assert.strictEqual(e.participant, 'WFJMFG763');
      assert.strictEqual(e.conversation, 'CHAF1FWN5');
    });

    test('returns undefined for unknown id', () => {
      adapter = new RsmfAdapter(manifest);
      assert.strictEqual(adapter.getEventById('NONEXISTENT'), undefined);
    });
  });

  describe('getEventsByConversationId', () => {
    test('returns events for CHAF1FWN5 (organization)', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEventsByConversationId('CHAF1FWN5');
      assert.strictEqual(events.length, 6);
      events.forEach(e => assert.strictEqual(e.conversation, 'CHAF1FWN5'));
    });

    test('returns all events when passed null (ALL)', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEventsByConversationId(null);
      assert.strictEqual(events.length, manifest.events.length);
    });

    test('returns empty array for unknown conversation', () => {
      adapter = new RsmfAdapter(manifest);
      assert.deepStrictEqual(adapter.getEventsByConversationId('NONEXISTENT'), []);
    });
  });

  describe('getRootEvents', () => {
    test('root events for CHAF1FWN5 have no parent', () => {
      adapter = new RsmfAdapter(manifest);
      const roots = adapter.getRootEvents('CHAF1FWN5');
      assert.ok(roots.length > 0);
      roots.forEach(e => assert.strictEqual(e.parent, undefined));
    });

    test('root events for all conversations (null)', () => {
      adapter = new RsmfAdapter(manifest);
      const roots = adapter.getRootEvents(null);
      roots.forEach(e => assert.strictEqual(e.parent, undefined));
    });
  });

  describe('getEventsByParentId', () => {
    test('returns children of a thread parent', () => {
      adapter = new RsmfAdapter(manifest);
      const children = adapter.getEventsByParentId('GHJQZ4YBH_1554216034.0059');
      assert.ok(children.length > 5);
      children.forEach(e => assert.strictEqual(e.parent, 'GHJQZ4YBH_1554216034.0059'));
    });

    test('returns empty for event with no children', () => {
      adapter = new RsmfAdapter(manifest);
      assert.deepStrictEqual(adapter.getEventsByParentId('CHAF1FWN5_1554216835.0015'), []);
    });

    test('returns all events when passed null (ALL)', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEventsByParentId(null);
      assert.strictEqual(events.length, manifest.events.length);
    });
  });

  describe('getEvents (combined filter)', () => {
    test('parentId="" returns root events for conversation', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEvents('CHAF1FWN5', '');
      events.forEach(e => {
        assert.strictEqual(e.conversation, 'CHAF1FWN5');
        assert.strictEqual(e.parent, undefined);
      });
    });

    test('parentId=null returns all events in conversation', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEvents('CHAF1FWN5', null);
      assert.strictEqual(events.length, 6);
    });

    test('specific parentId returns children regardless of conversationId arg', () => {
      adapter = new RsmfAdapter(manifest);
      const children = adapter.getEvents('ignored', 'GHJQZ4YBH_1554233489.0278');
      assert.strictEqual(children.length, 3);
      assert.strictEqual(children[0].body, 'first reply');
    });
  });

  describe('event ordering', () => {
    test('events are sorted by timestamp ascending', () => {
      adapter = new RsmfAdapter(manifest);
      const events = adapter.getEventsByConversationId(null);
      for (let i = 1; i < events.length; i++) {
        const t1 = Date.parse(events[i - 1].timestamp);
        const t2 = Date.parse(events[i].timestamp);
        assert.ok(t1 <= t2, `Event ${i} out of order: ${events[i-1].timestamp} > ${events[i].timestamp}`);
      }
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
