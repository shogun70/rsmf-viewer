/**
 * Adapter for navigating RSMF (Relativity Short Message Format) manifest data.
 * Uses Dexie (IndexedDB) for indexed storage and querying.
 *
 * TODO Validation improvements:
 * - IDs should be trimmed to null (and logged as a warning):
 *     *.id, event.conversation, event.participant, conversation.participants[]
 * - event.participant not found in participants should create a virtual participant
 *     (similar to how missing conversations are handled)
 * - Duplicate IDs: currently stored but only first is returned by getXxxById();
 *     consider exposing duplicates or surfacing them in a validation report
 * - event.parent referencing a non-existent event: error is logged but the event
 *     is still stored with that parent value (orphaned in queries by parent)
 */

import Dexie from './vendor/dexie/dexie.mjs';

class RsmfAdapter
{
    /**
     * Sentinel for orphan conversations or top-level (parentless) events.
     * @type {string}
     * @warning This property is not truly constant — do not reassign.
     */
    static NONE = '';
    /** @type {string} Display label for the NONE sentinel. */
    static NONE_DISPLAY = 'NONE';

    /**
     * Sentinel meaning "all" — disables filtering.
     * @type {null}
     * @warning This property is not truly constant — do not reassign.
     */
    static ALL = null;
    /** @type {string} Display label for the ALL sentinel. */
    static ALL_DISPLAY = 'ALL';

    NONE = RsmfAdapter.NONE;
    ALL = RsmfAdapter.ALL;

    #db;

    constructor(db) {
        this.#db = db;
    }

    static #addError(item, message) {
        if (!item._errors) item._errors = [];
        item._errors.push(message);
    }

    /**
     * Create and populate an RsmfAdapter from a manifest object.
     * @param {Object} manifest - Parsed rsmf_manifest.json containing
     *   participants, conversations, and events arrays.
     * @param {string} dbName - IndexedDB database name.
     * @returns {Promise<RsmfAdapter>}
     */
    static async create(manifest, dbName) {
        let db = new Dexie(dbName);
        db.version(1).stores({
            participants: '++, id',
            conversations: '++, id, platform, type',
            events: '++, id, conversation, parent, participant, timestamp, [conversation+parent]'
        });

        // Clear any existing data (re-import)
        await db.participants.clear();
        await db.conversations.clear();
        await db.events.clear();

        // Index participants by ID, check for duplicates
        let participants = [];
        let participantIds = new Set();
        for (let participant of (manifest.participants || [])) {
            let id = participant.id;
            if (typeof id !== 'string') {
                console.warn('RSMF participant has invalid ID', id);
                continue;
            }
            if (participantIds.has(id)) {
                console.warn('Duplicate RSMF participant ID', id);
                RsmfAdapter.#addError(participant, `Duplicate participant:${id}`);
            }
            participantIds.add(id);
            participants.push(participant);
        }
        await db.participants.bulkAdd(participants);

        // Index conversations by ID, adding virtual entries for orphans
        let conversations = [];
        let convIds = new Set();
        for (let conversation of (manifest.conversations || [])) {
            let id = conversation.id;
            if (typeof id !== 'string') {
                console.warn('RSMF conversation has invalid ID', id);
                continue;
            }
            if (convIds.has(id)) {
                console.warn('Duplicate RSMF conversation ID', id);
                RsmfAdapter.#addError(conversation, `Duplicate conversation:${id}`);
            }
            convIds.add(id);
            conversations.push(conversation);
        }

        // Sort events by timestamp
        let sorted = (manifest.events || []).sort(RsmfAdapter.eventComparator);

        // Pass 1: Normalize and validate event fields
        let eventIds = new Set();
        for (let event of sorted) {
            // Check for duplicate ID
            let id = RsmfAdapter.getStringOrNull(event, 'id');
            if (id !== null && eventIds.has(id)) {
                console.warn('Duplicate RSMF event ID', id);
                RsmfAdapter.#addError(event, `Duplicate event:${id}`);
            }
            if (id !== null) eventIds.add(id);

            // Normalize indexed fields: use NONE for missing conversation/parent
            if (!event.hasOwnProperty('conversation')) event.conversation = RsmfAdapter.NONE;
            if (!event.hasOwnProperty('parent')) event.parent = RsmfAdapter.NONE;

            // Validate conversation reference
            let convId = event.conversation;
            // TODO if event.participant is not in participantIds, create a virtual participant
            if (convId !== RsmfAdapter.NONE && !convIds.has(convId)) {
                console.warn("Found event with non-existent conversation ID", convId);
                conversations.push({ _virtual: true, id: convId });
                convIds.add(convId);
            }
            if (convId === RsmfAdapter.NONE && !convIds.has(RsmfAdapter.NONE)) {
                conversations.push({ _virtual: true, id: RsmfAdapter.NONE, display: RsmfAdapter.NONE_DISPLAY });
                convIds.add(RsmfAdapter.NONE);
            }
        }

        // Pass 2: Validate parent relationships
        for (let event of sorted) {
            let parentId = event.parent;
            if (parentId === RsmfAdapter.NONE) continue;

            if (!eventIds.has(parentId)) {
                RsmfAdapter.#addError(event, `Parent event:${parentId} not found`);
                continue;
            }

            let parent = sorted.find(e => e.id === parentId);
            if (parent) {
                let parentConv = parent.conversation;
                let eventConv = event.conversation;

                if (parentConv !== RsmfAdapter.NONE && eventConv === RsmfAdapter.NONE) {
                    RsmfAdapter.#addError(event,
                        `This event:${event.id} has conversation:${RsmfAdapter.NONE_DISPLAY} but parent event:${parentId} is in conversation:${parentConv}`);
                }
                else if (parentConv !== RsmfAdapter.NONE && eventConv !== RsmfAdapter.NONE && eventConv !== parentConv) {
                    RsmfAdapter.#addError(event,
                        `This event:${event.id} is in conversation:${eventConv} but parent event:${parentId} is in conversation:${parentConv}`);
                }
            }
        }

        // Pre-compute reply counts so they're available as a field, not a query
        let replyCounts = {};
        for (let event of sorted) {
          if (event.parent) replyCounts[event.parent] = (replyCounts[event.parent] || 0) + 1;
        }
        // NOTE _participantDisplay denormalizes the participant name onto each event,
        // saving a separate participants lookup at render time.
        let pMap = new Map(participants.map(p => [p.id, p]));
        for (let event of sorted) {
          event._replyCount = replyCounts[event.id] || 0;
          let p = pMap.get(event.participant);
          event._participantDisplay = p?.display || event.participant || 'Unknown';
        }

        await db.conversations.bulkAdd(conversations);
        await db.events.bulkAdd(sorted);

        return new RsmfAdapter(db);
    }

    /**
     * Return a field's value if it is a string, otherwise null.
     * @param {Object} object
     * @param {string} field
     * @returns {string|null}
     */
    static getStringOrNull(object, field) {
        let value = object[field];
        return typeof value === 'string' ? value : null;
    }

    // Participants

    /**
     * @returns {Promise<Object[]>} All participants.
     */
    async getParticipants() {
        return this.#db.participants.toArray();
    }

    /**
     * @param {string} id - Participant ID.
     * @returns {Promise<Object|undefined>} The participant, or undefined if not found.
     */
    async getParticipantById(id) {
        return this.#db.participants.where('id').equals(id).first();
    }

    // Conversations

    /**
     * @returns {Promise<Object[]>} All conversations (including virtual ones created for orphan events).
     */
    async getConversations() {
        return this.#db.conversations.toArray();
    }

    /**
     * @param {string} id - Conversation ID.
     * @returns {Promise<Object|undefined>} The conversation, or undefined if not found.
     */
    async getConversationById(id) {
        return this.#db.conversations.where('id').equals(id).first();
    }

    /**
     * Get conversations by platform.
     * @param {string} platform
     * @returns {Promise<Object[]>}
     */
    async getConversationsByPlatform(platform) {
        return this.#db.conversations.where('platform').equals(platform).toArray();
    }

    /**
     * Get conversations by type.
     * @param {string} type
     * @returns {Promise<Object[]>}
     */
    async getConversationsByType(type) {
        return this.#db.conversations.where('type').equals(type).toArray();
    }

    // Events

    /**
     * Get events filtered by conversation and/or parent.
     *
     * - If parentId is a non-empty string: returns events with that parentId (children of that event).
     * - If parentId is '' (NONE): returns root events (no parent) within the conversation.
     * - If parentId is null (ALL): returns all events in the conversation regardless of parent.
     *
     * The conversationId can be a specific ID, '' (NONE) for orphan events, or null (ALL) for all conversations.
     *
     * @param {string|null} conversationId
     * @param {string|null} parentId
     * @returns {Promise<Object[]>}
     */
    async getEvents(conversationId, parentId) {
        if (parentId === RsmfAdapter.ALL) return this.getEventsByConversationId(conversationId);
        if (parentId === RsmfAdapter.NONE) return this.getRootEvents(conversationId);
        return this.getEventsByParentId(parentId);
    }

    /**
     * @param {string} id - Event ID.
     * @returns {Promise<Object|undefined>} The event, or undefined if not found.
     */
    async getEventById(id) {
        return this.#db.events.where('id').equals(id).first();
    }

    /**
     * Get all events in a conversation (regardless of parent), or all events if conversationId is null (ALL).
     * @param {string|null} conversationId
     * @returns {Promise<Object[]>}
     */
    async getEventsByConversationId(conversationId) {
        if (conversationId === RsmfAdapter.ALL) return this.#db.events.toArray();
        return this.#db.events.where('conversation').equals(conversationId).toArray();
    }

    /**
     * Get top-level events (no parent) optionally filtered by conversation.
     * @param {string|null} conversationId - Specific conversation, '' for orphans, null for all.
     * @returns {Promise<Object[]>}
     */
    async getRootEvents(conversationId) {
        if (conversationId === RsmfAdapter.ALL) {
            return this.#db.events.where('parent').equals(RsmfAdapter.NONE).toArray();
        }
        return this.#db.events.where('[conversation+parent]').equals([conversationId, RsmfAdapter.NONE]).toArray();
    }

    /**
     * Get child events of a specific parent, or all events if parentId is null (ALL).
     * @param {string|null} parentId
     * @returns {Promise<Object[]>}
     */
    async getEventsByParentId(parentId) {
        if (parentId === RsmfAdapter.ALL) return this.#db.events.toArray();
        return this.#db.events.where('parent').equals(parentId).toArray();
    }

    /**
     * Get events by participant.
     * @param {string} participantId
     * @returns {Promise<Object[]>}
     */
    async getEventsByParticipant(participantId) {
        return this.#db.events.where('participant').equals(participantId).toArray();
    }

    /**
     * Get the count of direct replies to an event.
     * @param {string} eventId
     * @returns {Promise<number>}
     */
    async getReplyCount(eventId) {
        return this.#db.events.where('parent').equals(eventId).count();
    }

    /**
     * Comparator for sorting events by timestamp (ascending).
     * @param {Object} evt1
     * @param {Object} evt2
     * @returns {number}
     */
    static eventComparator = (evt1, evt2) => {
        let t1 = RsmfAdapter.parseTimestamp(evt1.timestamp);
        let t2 = RsmfAdapter.parseTimestamp(evt2.timestamp);
        return isNaN(t1) && isNaN(t2) ? 0 :
                 isNaN(t1) ? 1 :
                 isNaN(t2) ? -1 :
                 t1 - t2;
    };

    /**
     * Parse a timestamp string into milliseconds since epoch.
     * @param {string} timestamp
     * @returns {number} Milliseconds since epoch, or NaN if unparseable.
     */
    static parseTimestamp(timestamp) {
        return Date.parse(timestamp);
    }
}

export default RsmfAdapter;
