/**
 * Adapter to rsmf_manifest.json
 */
class RsmfAdapter
{
    // NONE represents the conversationId of orphan messages, the parentId of top-level messages.
    static #NONE = '';
    static #NONE_STRING = RsmfAdapter.#stringify(RsmfAdapter.#NONE);
    static #NONE_DISPLAY = 'NONE';

    // ALL is more-or-less a no-op filter.
    static #ALL = null;
    static #ALL_STRING = RsmfAdapter.#stringify(RsmfAdapter.#ALL);
    static #ALL_DISPLAY = 'ALL';

    #manifest;
    #participantsById = new Map();
    #conversationsById = new Map();
    #eventsOrdered;
    #eventsById = new Map();
    #eventsByConversationId = new Map();
    #rootEvents = [];
    #eventsByParentId = new Map();

    constructor(manifest)
    {
        this.#eventsByConversationId.set(RsmfAdapter.#NONE, []);
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
                if (!this.#conversationsById.has(RsmfAdapter.#NONE)) {
                    this.#conversationsById.set(RsmfAdapter.#NONE, {
                        virtual: true,
                        id: RsmfAdapter.#NONE,
                        display: RsmfAdapter.#NONE_DISPLAY,
                    });
                }
                this.#eventsByConversationId.get(RsmfAdapter.#NONE).push(event);
            }
        });
    }

    static getStringOrNull(object, field) {
        let value = object[field];
        return typeof value === 'string' ? value : null;
    }

    getParticipants()
    {
        return this.#manifest['participants'];
    }

    getParticipantById(id)
    {
        return this.#participantsById.get(id);
    }

    getConversations()
    {
        return this.#conversationsById.values().toArray();
    }

    getConversationById(id)
    {
        return this.#conversationsById.get(id);
    }

    /**
     * Get events by conversation and / or parent.
     * If parentId is non-empty then events with that parentId, otherwise
     * If parentId is the empty string then events with no parentId but with the specified conversationId, otherwise
     * If parentId is null then all events with the specified conversationId, otherwise
     * all events.
     * The conversationId can be specified, or the empty string for orphan events, or null for all conversations.
     *
     * @param conversationId
     * @param parentId
     * @returns event array
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

    getEventById(id)
    {
        return this.#eventsById.get(id);
    }

    getEventsByConversationId(conversationId)
    {
        switch (RsmfAdapter.#stringify(conversationId)) {
            case RsmfAdapter.#ALL_STRING:
                return this.#eventsOrdered;
            default:
                return this.#eventsByConversationId.has(conversationId) ?
                    this.#eventsByConversationId.get(conversationId) :
                    [];
        }
    }

    getRootEvents(conversationId)
    {
        var events = this.#rootEvents;
        switch (RsmfAdapter.#stringify(conversationId))
        {
            case RsmfAdapter.#ALL_STRING:
                return events;
            default:
                return events.filter(event => event['conversation'] === conversationId);
        }
    }

    getEventsByParentId(parentId)
    {
        switch (RsmfAdapter.#stringify(parentId)) {
            case RsmfAdapter.#ALL_STRING:
                return this.#eventsOrdered;
            default:
                return this.#eventsByParentId.has(parentId) ?
                    this.#eventsByParentId.get(parentId) :
                    [];
        }
    }

    static eventComparator = (evt1, evt2) => {
        const tsProp = 'timestamp';
        let t1 = RsmfAdapter.parseTimestamp(evt1[tsProp]);
        let t2 = RsmfAdapter.parseTimestamp(evt2[tsProp]);
        return isNaN(t1) && isNaN(t2) ? 0 :
                 isNaN(t2) ? -1 :
                 isNaN(t2) ? 1 :
                 t1 - t2;
    };

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
        return object + '';
    }
}
