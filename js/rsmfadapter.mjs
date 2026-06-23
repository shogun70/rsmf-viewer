import IndexedList from './indexedlist.mjs';

/**
 * Adapter for navigating RSMF (Relativity Short Message Format) manifest data.
 * Indexes participants, conversations, and events from an rsmf_manifest.json
 * structure, providing lookup by ID and filtered retrieval.
 */
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

    #manifest;
    #participants; // IndexedList with index on id
    #conversations; // IndexedList with indexes on id, platform, type
    #events; // IndexedList with indexes on id, conversation, parent, participant

    /**
     * @param {Object} manifest - Parsed rsmf_manifest.json object containing
     *   participants, conversations, and events arrays.
     */
    constructor(manifest)
    {
        this.#manifest = manifest;
        this.#participants = new IndexedList(null, ['id']);
        this.#conversations = new IndexedList(null, ['id', 'platform', 'type']);
        this.#events = new IndexedList(null, ['id', 'conversation', 'parent', 'participant']);

        // Index participants by ID
        this.#manifest['participants'].forEach(participant => {
            var id = participant['id'];
            if (typeof id === 'string') {
                if (this.#participants.count('id', id)) {
                    console.warn('Duplicate RSMF participant ID', id);
                    RsmfAdapter.#addError(participant, `Duplicate participant:${id}`);
                }
                this.#participants.add(participant);
            }
            else console.warn('RSMF participant has invalid ID', id);
        });

        // Index conversations by ID
        this.#manifest['conversations'].forEach(conversation => {
            var id = conversation['id'];
            if (typeof id === 'string') {
                if (this.#conversations.count('id', id)) {
                    console.warn('Duplicate RSMF conversation ID', id);
                    RsmfAdapter.#addError(conversation, `Duplicate conversation:${id}`);
                }
                this.#conversations.add(conversation);
            }
            else console.warn('RSMF conversation has invalid ID', id);
        });

        // Sort events by timestamp
        let sorted = this.#manifest['events'].sort(RsmfAdapter.eventComparator);

        // Pass 1: Add events to IndexedList, validate conversation references
        sorted.forEach(event => {
            let id = RsmfAdapter.getStringOrNull(event, 'id');
            let conversationId = RsmfAdapter.getStringOrNull(event, 'conversation');

            // Validate conversation reference
            if (conversationId !== null && !this.#conversations.count('id', conversationId)) {
                console.warn("Found event with non-existent conversation ID", conversationId);
                this.#conversations.add({ virtual: true, id: conversationId });
            }
            if (conversationId === null) {
                if (!this.#conversations.count('id', RsmfAdapter.NONE)) {
                    this.#conversations.add({
                        virtual: true,
                        id: RsmfAdapter.NONE,
                        display: RsmfAdapter.NONE_DISPLAY,
                    });
                }
            }

            // Normalize indexed fields: use NONE for missing conversation/parent
            if (!event.hasOwnProperty('conversation')) event.conversation = RsmfAdapter.NONE;
            if (!event.hasOwnProperty('parent')) event.parent = RsmfAdapter.NONE;

            // Check for duplicate ID
            if (id !== null && this.#events.count('id', id)) {
                console.warn('Duplicate RSMF event ID', id);
                RsmfAdapter.#addError(event, `Duplicate event:${id}`);
            }

            this.#events.add(event);
        });

        // Pass 2: Validate parent relationships
        sorted.forEach(event => {
            let parentId = event.parent;
            if (parentId === RsmfAdapter.NONE) return;

            if (!this.#events.count('id', parentId)) {
                RsmfAdapter.#addError(event, `Parent event:${parentId} not found`);
                return;
            }

            let parent = this.#events.entries('id', parentId)[0];
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
        });
    }

    static #addError(event, message) {
        if (!event.errors) event.errors = [];
        event.errors.push(message);
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

    /**
     * @returns {Object[]} All participants from the manifest.
     */
    getParticipants()
    {
        return this.#participants.all();
    }

    /**
     * @param {string} id - Participant ID.
     * @returns {Object|undefined} The participant, or undefined if not found.
     */
    getParticipantById(id)
    {
        let results = this.#participants.entries('id', id);
        return results.length > 0 ? results[0] : undefined;
    }

    /**
     * @returns {Object[]} All conversations (including virtual ones created for orphan events).
     */
    getConversations()
    {
        return this.#conversations.all();
    }

    /**
     * @param {string} id - Conversation ID.
     * @returns {Object|undefined} The conversation, or undefined if not found.
     */
    getConversationById(id)
    {
        let results = this.#conversations.entries('id', id);
        return results.length > 0 ? results[0] : undefined;
    }

    /**
     * Get conversations by platform.
     * @param {string} platform
     * @returns {Object[]}
     */
    getConversationsByPlatform(platform)
    {
        return this.#conversations.entries('platform', platform);
    }

    /**
     * Get conversations by type.
     * @param {string} type
     * @returns {Object[]}
     */
    getConversationsByType(type)
    {
        return this.#conversations.entries('type', type);
    }

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
     * @returns {Object[]}
     */
    getEvents(conversationId, parentId)
    {
        if (parentId === RsmfAdapter.ALL) return this.getEventsByConversationId(conversationId);
        if (parentId === RsmfAdapter.NONE) return this.getRootEvents(conversationId);
        return this.getEventsByParentId(parentId);
    }

    /**
     * @param {string} id - Event ID.
     * @returns {Object|undefined} The event, or undefined if not found.
     */
    getEventById(id)
    {
        let results = this.#events.entries('id', id);
        return results.length > 0 ? results[0] : undefined;
    }

    /**
     * Get all events in a conversation (regardless of parent), or all events if conversationId is null (ALL).
     * @param {string|null} conversationId
     * @returns {Object[]}
     */
    getEventsByConversationId(conversationId)
    {
        if (conversationId === RsmfAdapter.ALL) return this.#events.all();
        return this.#events.entries('conversation', conversationId);
    }

    /**
     * Get top-level events (no parent) optionally filtered by conversation.
     * @param {string|null} conversationId - Specific conversation, '' for orphans, null for all.
     * @returns {Object[]}
     */
    getRootEvents(conversationId)
    {
        let roots = this.#events.entries('parent', RsmfAdapter.NONE);
        if (conversationId === RsmfAdapter.ALL) return roots;
        return roots.filter(event => event.conversation === conversationId);
    }

    /**
     * Get child events of a specific parent, or all events if parentId is null (ALL).
     * @param {string|null} parentId
     * @returns {Object[]}
     */
    getEventsByParentId(parentId)
    {
        if (parentId === RsmfAdapter.ALL) return this.#events.all();
        return this.#events.entries('parent', parentId);
    }

    /**
     * Get events by participant.
     * @param {string} participantId
     * @returns {Object[]}
     */
    getEventsByParticipant(participantId)
    {
        return this.#events.entries('participant', participantId);
    }

    /**
     * Comparator for sorting events by timestamp (ascending).
     * @param {Object} evt1
     * @param {Object} evt2
     * @returns {number}
     */
    static eventComparator = (evt1, evt2) => {
        const tsProp = 'timestamp';
        let t1 = RsmfAdapter.parseTimestamp(evt1[tsProp]);
        let t2 = RsmfAdapter.parseTimestamp(evt2[tsProp]);
        return isNaN(t1) && isNaN(t2) ? 0 :
                 isNaN(t2) ? -1 :
                 isNaN(t2) ? 1 :
                 t1 - t2;
    };

    /**
     * Parse a timestamp string into milliseconds since epoch.
     * @param {string} timestamp
     * @returns {number} Milliseconds since epoch, or NaN if unparseable.
     */
    static parseTimestamp(timestamp)
    {
        return Date.parse(timestamp);
    }
}

export default RsmfAdapter;
