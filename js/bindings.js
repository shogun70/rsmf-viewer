class Binding {
}

class NodeManager {
    // TODO all this node manager stuff assumes that nodes are only released on unload
    //   This might need revising
    static #VENDOR_PREFIX = 'meeko';
    static #RANDOM = NodeManager.randomString(6);
    static #NODE_ID_PREFIX = '__' + NodeManager.#VENDOR_PREFIX + NodeManager.#RANDOM + '_';
    static #nodeManagerTable = {};
    document;
    #nodeCount = 0; // used to generated node IDs
    #nodeStorage = {}; // hash of storage for nodes, keyed off `nodeIdProperty`

    constructor(document) {
        this.document = document;
    }

    static randomString(length)
    {
        return Math.random().toString(36).slice(-length);
    }

    uniqueId(node) {
        console.assert(node.ownerDocument === this.document);

        let nodeId = node.id;
        if (!nodeId) {
            nodeId = NodeManager.#NODE_ID_PREFIX + this.#nodeCount++;
            node.id = nodeId;
        }
        return nodeId;
    }

    setData(node, data) { // FIXME assert node is element, data is binding.
        console.assert(node.ownerDocument === this.document);
        let nodeId = this.uniqueId(node);
        this.#nodeStorage[nodeId] = data;
    }

    hasData(node) {
        console.assert(node.ownerDocument === this.document);
        let nodeId = node.id;
        return !nodeId ? false : nodeId in this.#nodeStorage;
    }

    getData(node) { // TODO should this throw if no data?
        console.assert(node.ownerDocument === this.document);
        let nodeId = node.id;
        if (!nodeId) return null;
        return this.#nodeStorage[nodeId];
    }

    releaseNodes() {
        for (let id of Object.keys(this.#nodeStorage))
        {
            delete this.#nodeStorage[id];
        }
        this.#nodeStorage = {};
    }

    static getNodeManager(node) {
        let myDoc = node.ownerDocument;
        let nodeManager = NodeManager.#nodeManagerTable[myDoc];
        if (!nodeManager) {
            nodeManager = new NodeManager(myDoc);
            NodeManager.#nodeManagerTable[myDoc] = nodeManager;
        }
        return nodeManager;
    }

    static #releaseAllNodes()
    {
        console.log(NodeManager.#nodeManagerTable);
        for (let nodeManager of Object.values(NodeManager.#nodeManagerTable)) {
            nodeManager.releaseNodes();
        }
        NodeManager.#nodeManagerTable = {};
    }

    static {
        window.addEventListener('beforeunload', () => NodeManager.#releaseAllNodes());
    }
}

class Bindings {
    register(element, binding, handlers)
    {
        if (element == null) {
            if (document.currentScript) {
                element = Bindings.getTarget(document.currentScript);
            }
            if (element == null) throw new Error('Could not autodetect target for binding.');
        }

        if (!!binding) {
            binding = this.attachBinding(element, binding);
            // Add 'on*' handlers.
            for (let slot of Object.keys(binding).filter(k => k.startsWith('on'))) {
                let type = slot.replace('on', '');
                let callback = binding[slot];
                if (callback instanceof Function) {
                    element.addEventListener(type, (ev) => callback.call(binding, ev, binding, ev.currentTarget), false);
                }
            }
        }

        // Add handlers.
        this.addHandlers(element, handlers, binding);
    }

    /**
     * Attach a binding to an element.
     * @param element {Element}
     * @param binding {Object}
     * @returns {Object} the binding.
     */
    attachBinding(element, binding) {
        let nodeManager = NodeManager.getNodeManager(element);
        if (Object.getPrototypeOf(binding) === Object.prototype) {
            Object.setPrototypeOf(binding, Binding.prototype); //
        }
        binding.id = nodeManager.uniqueId(element);
        Object.defineProperty(binding, 'element', { get: function() { return document.getElementById(this.id); }});
        nodeManager.setData(element, binding);
        return binding;
    }

    /**
     * Add event listeners to an element.
     * @param element {Element}
     * @param handlers {[AddEventListenerOptions]} - only the `capture` property is honored.
     * @param thisArg {Object|null} `this` for handlers.
     */
    addHandlers(element, handlers, thisArg) {
        if (!Array.isArray(handlers)) return;
        for (let handler of handlers) {
            this.addHandler(element, handler, thisArg);
        }
    }

    /**
     * Add event listeners to an element.
     * @param element {Element}
     * @param handler {AddEventListenerOptions} - only the `capture` property is honored.
     * @param thisArg {Object|null} `this` for handlers.
     */
    addHandler(element, handler, thisArg) {
        element.addEventListener(handler.type, (ev) => {
            if (!Bindings.matchesEvent(handler, ev)) return false;
            return handler.action.call(thisArg, ev, thisArg, ev.currentTarget);
        }, !!handler.capture || handler.phase === 'capture');
    }

    /**
     * Derive the target element (for a registration) from a script element.
     * @param script
     * @returns {Element}
     */
    static getTarget(script) {
        let target = script;
        while (target = target.previousElementSibling) {
            if (!['STYLE', 'SCRIPT'].includes(target.tagName)) break;
        }
        return target || script.parentNode; // TODO what if the parentNode is <html> or <head>?
    }

    static matchesEvent(handler, event) {
        if (handler.type && handler.type !== event.type) return false;
        if (handler.phase === 'target' && event.currentTarget !== event.target) return false; // other phase checks are in registration
        if (handler.code && !handler.code.split(/\s*,\s*/).includes(event.code)) return false
        if (handler.key && !handler.key.split(/\s*,\s*/).includes(event.key)) return false;
        if (handler.clickCount && handler.clickCount !== event.clickCount) return false;

        return true;
    }
}

window.Bindings = Bindings;
window.bindings = new Bindings();

Object.defineProperty(Element.prototype, '$', { get: function() {
    let nodeManager = NodeManager.getNodeManager(this);
    if (nodeManager.hasData(this)) return nodeManager.getData(this);
    return bindings.attachBinding(this, {});
}});

// attach bindings from <script for>
document.addEventListener('DOMContentLoaded', (e) => {
   let scripts = document.querySelectorAll('script[for]').values().filter(el => !el.getAttribute('for'));
   for (let script of scripts) {
       let fn = new Function(`return (${script.textContent})`);
       let o = fn();
       let currentTarget = Bindings.getTarget(script);
       bindings.register(currentTarget, o);
   }
});
