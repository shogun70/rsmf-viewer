/**
 * Adapter to rsmf_manifest.json
 */
class RsmfAdapter
{
    #manifest;
    #participantsById = new Map();
    #conversationsById = new Map();
    #eventsOrdered;
    #eventsById = new Map();
    #eventsByConversationId = new Map();
    #rootEventsByConversationId = new Map();
    #eventsByParentId = new Map();
    #uncategorizedEvents = [];

    constructor(manifest)
    {
        this.#manifest = manifest;

        this.#manifest['participants'].forEach(participant => {
            var id = participant['id'];
            if (typeof id === 'string') this.#participantsById.set(id, participant);
            else console.warn('RSMF participant has invalid ID');
        });
        this.#manifest['conversations'].forEach(conversation => {
            var id = conversation['id'];
            if (typeof id === 'string') this.#conversationsById.set(id, conversation);
            else console.warn('RSMF conversation has invalid ID');
        });
        this.#eventsOrdered = this.#manifest['events']
            .sort(RsmfAdapter.eventComparator);

        this.#eventsOrdered.forEach(event => {
            var id = event['id'];
            if (typeof id === 'string') this.#eventsById.set(id, event);
            else if (id != null) console.warn('RSMF event has invalid ID');
        });
        this.#eventsOrdered.forEach(event => {
            const id = event['id'];
            let isUncategorized = true;

            const conversationId = event['conversation'];
            if (typeof conversationId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#eventsByConversationId, conversationId, []);
                events.push(event);
                isUncategorized = false;
            }

            var parentId = event['parent'];
            if (typeof parentId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#eventsByParentId, parentId, []);
                events.push(event);
                isUncategorized = false;
            }
            else if (typeof conversationId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#rootEventsByConversationId, conversationId, []);
                events.push(event);
                isUncategorized = false;
            }

            if (isUncategorized) {
                this.#uncategorizedEvents.push(event);
            }
        });
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
        return this.#manifest['conversations'];
    }

    getConversationById(id)
    {
        return this.#conversationsById.get(id);
    }

    getEvents()
    {
        return this.#eventsOrdered;
    }

    getEventById(id)
    {
        return this.#eventsById.get(id);
    }

    getEventsByConversationId(conversationId)
    {
        return this.#eventsByConversationId.has(conversationId) ?
            this.#eventsByConversationId.get(conversationId) :
            [];
    }

    getRootEventsByConversationId(conversationId)
    {
        return this.#rootEventsByConversationId.has(conversationId) ?
            this.#rootEventsByConversationId.get(conversationId) :
            conversationId === 'NONE' ? this.#uncategorizedEvents : [];
    }

    getUncategorizedEvents()
    {
        return this.#uncategorizedEvents;
    }

    getEventsByParentId(parentId)
    {
        return this.#eventsByParentId.has(parentId) ?
            this.#eventsByParentId.get(parentId) :
            [];
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
}
