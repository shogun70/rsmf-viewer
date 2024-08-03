// FIXME make this a module when Firefox implements support for modules in ServiceWorkers.

class FileStore {
    static #opfsRootFu = navigator.storage.getDirectory();
    #opfsBaseFu;
    #basePath;
    #options = {};

    constructor(basePath, options) {
        this.#basePath = this.#inferPathSegments(basePath);
        if (options != null) Object.assign(this.#options, options);
        this.#opfsBaseFu = this.#getRelativeDirectoryHandle(this.#basePath, FileStore.#opfsRootFu, {create: true});
    }

    async remove() {
        if (!this.#options.create) throw new Error('Instantiate with {create: true} to enable remove().');
        let segments = [...this.#basePath];
        let last = segments.pop();
        let parentDir = await this.#getRelativeDirectoryHandle(segments, FileStore.#opfsRootFu);
        await parentDir.removeEntry(last, {recursive: true});
    }

    getBasePath() {
        return this.#basePath.join('/') + '/';
    }

    async getFileHandle(path) {
        const segments = this.#inferPathSegments(path);
        const filename = segments.pop();
        const dir = await this.#getDirectoryHandle(segments);
        return dir.getFileHandle(filename, this.#options);
    }

    async #getDirectoryHandle(path) {
        return this.#getRelativeDirectoryHandle(path, this.#opfsBaseFu, this.#options);
    }

    async #getRelativeDirectoryHandle(path, baseDir, options) {
        return this.#inferPathSegments(path).reduce(
                (promise, segment) => {
                    return promise.then(dir => {
                        console.debug(dir, segment);
                        return dir.getDirectoryHandle(segment, options)
                    });
                },
                Promise.resolve(baseDir));
    }

    #inferPathSegments(path) {
        if (path instanceof Array) return path;
        if (typeof path === 'string') {
            // this will remove empty components at start and end of '/abc/xyz/';
            return path.trim().split('/').filter(part => part !== '');
        }
        throw new Error('Bad path spec: ', path);
    }
}
