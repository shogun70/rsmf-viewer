/**
 * Adapter to rsmf_manifest.json
 */
class RsmfAdapter
{
    #manifest;
    #participantsById = new Map();
    #conversationsById = new Map();
    #eventsById = new Map();
    #eventsByConversationId = new Map();
    #rootEventIdsByConversationId = new Map();
    #eventIdsByParentId = new Map();
    #orphanEvents = []; // FIXME not displayed

    constructor(manifest)
    {
        this.#manifest = manifest;

        this.getParticipants().forEach(participant => {
            var id = participant['id'];
            if (typeof id === 'string') this.#participantsById.set(id, participant);
            else console.warn('RSMF participant has invalid ID');
        });
        this.getConversations().forEach(conversation => {
            var id = conversation['id'];
            if (typeof id === 'string') this.#conversationsById.set(id, conversation);
            else console.warn('RSMF conversation has invalid ID');
        });
        this.getEvents().forEach(event => {
            var id = event['id'];
            if (typeof id === 'string') this.#eventsById.set(id, event);
            else if (id != null) console.warn('RSMF event has invalid ID');
        });
        this.getEvents().forEach(event => {
            const id = event['id'];
            let isOrphan = true;

            const conversationId = event['conversation'];
            if (typeof conversationId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#eventsByConversationId, conversationId, []);
                events.push(event);
                isOrphan = false;
            }

            var parentId = event['parent'];
            if (typeof parentId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#eventIdsByParentId, parentId, []);
                events.push(id);
                isOrphan = false;
            }
            else if (typeof conversationId === 'string') {
                let events = RsmfAdapter.#getOrSet(this.#rootEventIdsByConversationId, conversationId, []);
                events.push(id);
                isOrphan = false;
            }

            if (isOrphan) {
                this.#orphanEvents.push(id);
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

    getEvents = () => {
        let allEvents = this.#manifest['events'];
        return allEvents
            .sort(RsmfAdapter.eventComparator);
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

    getRootEventIdsByConversationId(conversationId)
    {
        return this.#rootEventIdsByConversationId.has(conversationId) ?
            this.#rootEventIdsByConversationId.get(conversationId) :
            [];
    }

    getEventIdsByParentId(parentId)
    {
        return this.#eventIdsByParentId.has(parentId) ?
            this.#eventIdsByParentId.get(parentId) :
            [];
    }

    static eventComparator = (evt1, evt2) => { // FIXME is this working?
        const tsProp = 'timestamp';
        if (evt1 == null || !evt1.hasOwnProperty(tsProp))
        {
            return -1;
        }
        if (evt2 == null || !evt2.hasOwnProperty(tsProp))
        {
            return 1;
        }
        let t1 = RsmfAdapter.parseTimestamp(evt1[tsProp]);
        if (t1 == null)
        {
            return -1;
        }
        let t2 = RsmfAdapter.parseTimestamp(evt2[tsProp]);
        if (t2 == null)
        {
            return 1;
        }
        return t1 - t2;
    };

    static parseTimestamp(timestamp)
    {
        var ts = timestamp.toString();
        return Date.parse(ts);
    }

    static #getOrSet(map, key, value)
    {
        if (map.has(key)) return map.get(key);
        map.set(key, value);
        return value;
    }
}
