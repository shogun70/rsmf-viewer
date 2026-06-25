const { test, describe } = require('node:test');
const assert = require('node:assert');

const IndexedList = require('../js/indexedlist.js');

const items = [
    { id: '1', type: 'message', conversation: 'A' },
    { id: '2', type: 'message', conversation: 'A' },
    { id: '3', type: 'join', conversation: 'B' },
    { id: '4', type: 'message', conversation: 'B' },
    { id: '5', type: 'message' }, // no conversation
];

function buildList() {
    const list = new IndexedList('id', ['type', 'conversation']);
    items.forEach(item => list.add(item));
    return list;
}

describe('IndexedList', () => {
    const list = buildList();

    describe('all', () => {
        test('returns all items in insertion order', () => {
            assert.deepStrictEqual(list.all(), items);
        });
    });

    describe('length', () => {
        test('returns item count', () => {
            assert.strictEqual(list.length, 5);
        });
    });

    describe('get (primary key)', () => {
        test('returns item by primary key', () => {
            assert.strictEqual(list.get('1'), items[0]);
            assert.strictEqual(list.get('3'), items[2]);
        });

        test('returns undefined for missing key', () => {
            assert.strictEqual(list.get('99'), undefined);
        });
    });

    describe('has', () => {
        test('returns true for existing field/value', () => {
            assert.strictEqual(list.has('id', '1'), true);
            assert.strictEqual(list.has('type', 'join'), true);
            assert.strictEqual(list.has('conversation', 'A'), true);
        });

        test('returns false for missing value', () => {
            assert.strictEqual(list.has('id', '99'), false);
            assert.strictEqual(list.has('type', 'leave'), false);
        });

        test('returns false for non-indexed field', () => {
            assert.strictEqual(list.has('unknown', 'x'), false);
        });

        test('items with undefined field are not indexed', () => {
            assert.strictEqual(list.has('conversation', undefined), false);
        });
    });

    describe('values', () => {
        test('returns distinct values for indexed field', () => {
            assert.deepStrictEqual(list.values('type').sort(), ['join', 'message']);
            assert.deepStrictEqual(list.values('conversation').sort(), ['A', 'B']);
        });

        test('returns primary key values', () => {
            assert.deepStrictEqual(list.values('id').sort(), ['1', '2', '3', '4', '5']);
        });

        test('returns empty array for non-indexed field', () => {
            assert.deepStrictEqual(list.values('unknown'), []);
        });
    });

    describe('entries', () => {
        test('returns matching items for field/value', () => {
            const msgs = list.entries('conversation', 'A');
            assert.strictEqual(msgs.length, 2);
            assert.strictEqual(msgs[0].id, '1');
            assert.strictEqual(msgs[1].id, '2');
        });

        test('returns empty array for missing value', () => {
            assert.deepStrictEqual(list.entries('conversation', 'Z'), []);
        });

        test('returns empty array for non-indexed field', () => {
            assert.deepStrictEqual(list.entries('unknown', 'x'), []);
        });

        test('returns single-item array for primary key lookup', () => {
            const result = list.entries('id', '3');
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0].type, 'join');
        });
    });

    describe('add (duplicate primary key)', () => {
        test('throws on duplicate primary key', () => {
            const l = new IndexedList('id', ['type']);
            l.add({ id: 'x', type: 'a' });
            assert.throws(() => l.add({ id: 'x', type: 'b' }), /Duplicate primary key/);
        });
    });

    describe('put (upsert)', () => {
        test('inserts new item', () => {
            const l = new IndexedList('id', ['type', 'conversation']);
            l.put({ id: '1', type: 'message', conversation: 'A' });
            assert.strictEqual(l.length, 1);
            assert.strictEqual(l.get('1').type, 'message');
        });

        test('replaces existing item and updates indexes', () => {
            const l = new IndexedList('id', ['type', 'conversation']);
            l.put({ id: '1', type: 'message', conversation: 'A' });
            l.put({ id: '1', type: 'join', conversation: 'B' });
            assert.strictEqual(l.length, 1);
            assert.strictEqual(l.get('1').type, 'join');
            assert.strictEqual(l.get('1').conversation, 'B');
            // Old index values removed
            assert.deepStrictEqual(l.entries('conversation', 'A'), []);
            assert.deepStrictEqual(l.entries('type', 'message'), []);
            // New index values present
            assert.strictEqual(l.entries('conversation', 'B').length, 1);
            assert.strictEqual(l.entries('type', 'join').length, 1);
        });

        test('throws without primary key configured', () => {
            const l = new IndexedList(null, ['type']);
            l.add({ type: 'a' });
            assert.throws(() => l.put({ type: 'b' }), /requires a primary key/);
        });
    });

    describe('no primary key', () => {
        test('works without primary key', () => {
            const l = new IndexedList(null, ['type']);
            l.add({ type: 'a' });
            l.add({ type: 'a' });
            assert.strictEqual(l.length, 2);
            assert.strictEqual(l.entries('type', 'a').length, 2);
        });
    });

    describe('empty list', () => {
        const empty = new IndexedList('id', []);

        test('all returns empty array', () => {
            assert.deepStrictEqual(empty.all(), []);
        });

        test('length is 0', () => {
            assert.strictEqual(empty.length, 0);
        });

        test('has returns false', () => {
            assert.strictEqual(empty.has('id', '1'), false);
        });

        test('values returns empty array', () => {
            assert.deepStrictEqual(empty.values('id'), []);
        });
    });
});
