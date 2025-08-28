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
    #rootEvents = [];
    #eventsByParentId = new Map();

    constructor(manifest)
    {
        this.#eventsByConversationId.set('', []);
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
                            event['conversation'] = parentConversationId;
                            conversationId = parentConversationId;
                        }
                        else if (conversationId !== parentConversationId) {
                            console.warn("Ignoring parent relationship from different conversation", id, conversationId, parentId, parentConversationId);
                            delete event['parent']; // FIXME is this appropriate??
                            parentId = null;
                            parent = null;
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
                this.#eventsByConversationId.get('').push(event);
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
        return this.#conversationsById.values();
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
        return this.getRootEvents(conversationId);
    }

    getRootEvents(...conversationIds)
    {
        var events = this.#rootEvents;
        return conversationIds.length === 0 ? events :
            events.filter(event => conversationIds.includes(event['conversation']));
    }

    getUncategorizedEvents()
    {
        return this.getEventsByConversationId('');
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
