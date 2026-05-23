/**
 * A list that maintains indexes on specified fields for O(1) lookup.
 * Supports an optional primary key for uniqueness and upsert via put().
 */
export default class IndexedList {
    #items = [];
    #indexes = new Map(); // field -> Map<value, item[]>
    #primaryKey;
    #primaryIndex = new Map(); // key -> item

    /**
     * @param {string|null} primaryKey - Field name to use as unique primary key, or null for no primary key.
     * @param {string[]} fields - Field names to index.
     */
    constructor(primaryKey, fields) {
        this.#primaryKey = primaryKey ?? null;
        for (let field of fields) {
            this.#indexes.set(field, new Map());
        }
    }

    /**
     * Add an item and update all indexes. Throws on duplicate primary key.
     * @param {Object} item
     */
    add(item) {
        if (this.#primaryKey) {
            let key = item[this.#primaryKey];
            if (key !== undefined && this.#primaryIndex.has(key)) {
                throw Error(`Duplicate primary key: ${key}`);
            }
            if (key !== undefined) this.#primaryIndex.set(key, item);
        }
        this.#items.push(item);
        for (let [field, index] of this.#indexes) {
            let val = item[field];
            if (val === undefined) continue;
            let bucket = index.get(val);
            if (!bucket) { bucket = []; index.set(val, bucket); }
            bucket.push(item);
        }
    }

    /**
     * Insert or replace an item by primary key. Requires a primary key to be configured.
     * @param {Object} item
     */
    put(item) {
        if (!this.#primaryKey) throw Error('put() requires a primary key');
        let key = item[this.#primaryKey];
        if (key !== undefined && this.#primaryIndex.has(key)) {
            this.delete(this.#primaryIndex.get(key));
        }
        this.add(item);
    }

    /**
     * Get an item by primary key.
     * @param {*} key
     * @returns {Object|undefined}
     */
    get(key) {
        return this.#primaryIndex.get(key);
    }

    /**
     * @returns {Object[]} All items in insertion order.
     */
    all() { return this.#items; }

    /**
     * @returns {number} Number of items.
     */
    get length() { return this.#items.length; }

    /**
     * Count items matching a field/value pair.
     * @param {string} field
     * @param {*} value
     * @returns {number}
     */
    count(field, value) {
        if (field === this.#primaryKey) return this.#primaryIndex.has(value) ? 1 : 0;
        let bucket = this.#indexes.get(field)?.get(value);
        return bucket ? bucket.length : 0;
    }

    /**
     * Check if any item has the given value for the indexed field.
     * @param {string} field
     * @param {*} value
     * @returns {boolean}
     */
    has(field, value) {
        if (field === this.#primaryKey) return this.#primaryIndex.has(value);
        return this.#indexes.get(field)?.has(value) ?? false;
    }

    /**
     * Get all distinct values for an indexed field.
     * @param {string} field
     * @returns {Array}
     */
    values(field) {
        if (field === this.#primaryKey) return [...this.#primaryIndex.keys()];
        let index = this.#indexes.get(field);
        return index ? [...index.keys()] : [];
    }

    /**
     * Get all items matching a field/value pair.
     * @param {string} field
     * @param {*} value
     * @returns {Object[]}
     */
    entries(field, value) {
        if (field === this.#primaryKey) {
            let item = this.#primaryIndex.get(value);
            return item ? [item] : [];
        }
        return this.#indexes.get(field)?.get(value) ?? [];
    }

    /**
     * Remove an item from all indexes and the items list.
     * @param {Object} item
     */
    delete(item) {
        let i = this.#items.indexOf(item);
        if (i !== -1) this.#items.splice(i, 1);
        if (this.#primaryKey) {
            let key = item[this.#primaryKey];
            if (key !== undefined) this.#primaryIndex.delete(key);
        }
        for (let [field, index] of this.#indexes) {
            let val = item[field];
            if (val === undefined) continue;
            let bucket = index.get(val);
            if (bucket) {
                let j = bucket.indexOf(item);
                if (j !== -1) bucket.splice(j, 1);
            }
        }
    }
}
