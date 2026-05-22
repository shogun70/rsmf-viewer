/**
 * Adapter for navigating RSMF (Relativity Short Message Format) manifest data.
 * Indexes participants, conversations, and events from an rsmf_manifest.json
 * structure, providing lookup by ID and filtered retrieval.
 */
class RsmfAdapter
{
    /** @type {string} Sentinel for orphan conversations or top-level (parentless) events. */
    static NONE = '';
    static #NONE_STRING = RsmfAdapter.#stringify(RsmfAdapter.NONE);
    /** @type {string} Display label for the NONE sentinel. */
    static NONE_DISPLAY = 'NONE';

    /** @type {null} Sentinel meaning "all" — disables filtering. */
    static ALL = null;
    static #ALL_STRING = RsmfAdapter.#stringify(RsmfAdapter.ALL);
    /** @type {string} Display label for the ALL sentinel. */
    static ALL_DISPLAY = 'ALL';

    #manifest;
    #participantsById = new Map();
    #conversationsById = new Map();
    #eventsOrdered;
    #eventsById = new Map();
    #eventsByConversationId = new Map();
    #rootEvents = [];
    #eventsByParentId = new Map();

    /**
     * @param {Object} manifest - Parsed rsmf_manifest.json object containing
     *   participants, conversations, and events arrays.
     */
    constructor(manifest)
    {
        this.#eventsByConversationId.set(RsmfAdapter.NONE, []);
        this.#manifest = manifest;

        this.#manifest['participants'].forEach(participant => {
            var id = participant['id'];
            if (typeof id === 'string') {
                if (this.#eventsByParentId.has(id)) {
                    console.warn('Duplicate RSMF participant ID', id);
                }
                this.#participantsById.set(id, participant);
            }
            else console.warn('RSMF participant has invalid ID', id);
        });
        this.#manifest['conversations'].forEach(conversation => {
            var id = conversation['id'];
            if (typeof id === 'string') {
                if (this.#conversationsById.has(id)) {
                    console.warn('Duplicate RSMF conversation ID', id);
                }
                this.#conversationsById.set(id, conversation);
            }
            else console.warn('RSMF conversation has invalid ID', id);
        });
        this.#eventsOrdered = this.#manifest['events']
            .sort(RsmfAdapter.eventComparator);

        this.#eventsOrdered.forEach(event => {
            var id = event['id'];
            if (typeof id === 'string') {
                if (this.#eventsById.has(id)) {
                    console.warn('Duplicate RSMF event ID', id);
                }
                this.#eventsById.set(id, event);
            }
            else if (id != null) console.warn('RSMF event has invalid ID', id);
        });

        this.#eventsOrdered.forEach(event => {
            const id = RsmfAdapter.getStringOrNull(event, 'id');
            let conversationId = RsmfAdapter.getStringOrNull(event, 'conversation');
            if (conversationId !== null) {
                let conversation = this.#conversationsById.get(conversationId);
                if (conversation == null) {
                    console.warn("Found event with non-existent conversation ID", conversationId);
                    conversation = {
                        virtual: true,
                        id: conversationId,
                    }
                    this.#conversationsById.set(conversationId, conversation);
                }
                let events = RsmfAdapter.#getOrSet(this.#eventsByConversationId, conversationId, []);
                events.push(event);
            }

            let parentId = RsmfAdapter.getStringOrNull(event, 'parent');
            if (parentId != null) {
                let parent = this.#eventsById.get(parentId);
                if (parent !== null) {
                    // TODO more consistency checks
                    let parentConversationId = RsmfAdapter.getStringOrNull(parent, 'conversation');
                    if (parentConversationId !== null) {
                        if (!conversationId) {
                            console.warn("Inferring event conversation from parent");
                            event['invalid'] = 'Event has no conversation but parent does';
                            event['conversation'] = parentConversationId;
                            conversationId = parentConversationId;
                        }
                        else if (conversationId !== parentConversationId) {
                            console.warn("Ignoring parent relationship from different conversation", id, conversationId, parentId, parentConversationId);
                            event['invalid'] = "Parent is in different conversation";
                        }
                    }
                }
                else {
                    console.warn("Found event with non-existent parent ID", parentId);
                    parent = {
                        virtual: true,
                        id: parentId,
                        conversation: conversationId,
                        timestamp: event.timestamp,
                    }
                    this.#eventsById.set(parentId, parent);
                    this.#rootEvents.push(parent);
                }
            }

            if (parentId !== null) {
                let events = RsmfAdapter.#getOrSet(this.#eventsByParentId, parentId, []);
                events.push(event);
            }
            else {
                this.#rootEvents.push(event);
            }

            if (!conversationId) {
                if (!this.#conversationsById.has(RsmfAdapter.NONE)) {
                    this.#conversationsById.set(RsmfAdapter.NONE, {
                        virtual: true,
                        id: RsmfAdapter.NONE,
                        display: RsmfAdapter.NONE_DISPLAY,
                    });
                }
                this.#eventsByConversationId.get(RsmfAdapter.NONE).push(event);
            }
        });
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
        return this.#manifest['participants'];
    }

    /**
     * @param {string} id - Participant ID.
     * @returns {Object|undefined} The participant, or undefined if not found.
     */
    getParticipantById(id)
    {
        return this.#participantsById.get(id);
    }

    /**
     * @returns {Object[]} All conversations (including virtual ones created for orphan events).
     */
    getConversations()
    {
        return this.#conversationsById.values().toArray();
    }

    /**
     * @param {string} id - Conversation ID.
     * @returns {Object|undefined} The conversation, or undefined if not found.
     */
    getConversationById(id)
    {
        return this.#conversationsById.get(id);
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
        switch (RsmfAdapter.#stringify(parentId))
        {
            case RsmfAdapter.#NONE_STRING:
                return this.getRootEvents(conversationId);
            case RsmfAdapter.#ALL_STRING:
                return this.getEventsByConversationId(conversationId);
            default:
                return this.getEventsByParentId(parentId);
        }
    }

    /**
     * @param {string} id - Event ID.
     * @returns {Object|undefined} The event, or undefined if not found.
     */
    getEventById(id)
    {
        return this.#eventsById.get(id);
    }

    /**
     * Get all events in a conversation (regardless of parent), or all events if conversationId is null (ALL).
     * @param {string|null} conversationId
     * @returns {Object[]}
     */
    getEventsByConversationId(conversationId)
    {
        conversationId = RsmfAdapter.#stringify(conversationId);
        switch (conversationId) {
            case RsmfAdapter.#ALL_STRING:
                return this.#eventsOrdered;
            default:
                return this.#eventsByConversationId.has(conversationId) ?
                    this.#eventsByConversationId.get(conversationId) :
                    [];
        }
    }

    /**
     * Get top-level events (no parent) optionally filtered by conversation.
     * @param {string|null} conversationId - Specific conversation, '' for orphans, null for all.
     * @returns {Object[]}
     */
    getRootEvents(conversationId)
    {
        var events = this.#rootEvents;
        conversationId = RsmfAdapter.#stringify(conversationId);
        switch (conversationId)
        {
            case RsmfAdapter.#ALL_STRING:
                return events;
            case RsmfAdapter.#NONE_STRING:
                return events.filter((event) => !event.hasOwnProperty('conversation'));
            default:
                return events.filter(event => event['conversation'] === conversationId);
        }
    }

    /**
     * Get child events of a specific parent, or all events if parentId is null (ALL).
     * @param {string|null} parentId
     * @returns {Object[]}
     */
    getEventsByParentId(parentId)
    {
        parentId = RsmfAdapter.#stringify(parentId);
        switch (parentId) {
            case RsmfAdapter.#ALL_STRING:
                return this.#eventsOrdered;
            default:
                return this.#eventsByParentId.has(parentId) ?
                    this.#eventsByParentId.get(parentId) :
                    [];
        }
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

    static #getOrSet(map, key, value)
    {
        if (map.has(key)) return map.get(key);
        map.set(key, value);
        return value;
    }

    static #isNone(object) {
        return RsmfAdapter.#stringify(object) === RsmfAdapter.#NONE_STRING;
    }

    static #isAll(object) {
        return RsmfAdapter.#stringify(object) === RsmfAdapter.#ALL_STRING;
    }

    static #isSpecified(object) {
        let s = RsmfAdapter.#stringify(object);
        return s !== RsmfAdapter.#NONE_STRING && s !== RsmfAdapter.#ALL_STRING;
    }

    static #stringify(object) {
        let string = object + '';
        return string.trim();
    }
}
