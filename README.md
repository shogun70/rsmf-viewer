# RSMF Viewer

Viewer for [rsmf.zip](https://help.relativity.com/RelativityOne/Content/System_Guides/Relativity_Short_Message_Format/Processing_an_RSMF_file.htm#RSMFzip) files.

**WARNING: This is a work-in-progress. Don't rely on this tool for any forensic activity.**

## Installation

The RSMF Viewer is a single-page web application (currently supports recent Chrome, Firefox, Safari). 
It has no server-side code but it must be delivered from a web-server (presumably on the localhost) 
since it makes use of features which require [secure web context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts).

Download the code to a directory and then use a [static http server](https://gist.github.com/willurd/5720255) to serve that directory on localhost.
(There are also numerous static and simple http servers which can be installed or your IDE may provide this functionality.)

Assuming the directory is being served from `http://localhost:8000/` then open a new browser tab and navigate to:

  http://localhost:8000/index.html

This page will prompt you to choose a `rsmf.zip` file or a RSMF email file (`.rsmf` or `.eml`). 
If the file looks like a valid RSMF Zip (i.e. it contains `rsmf_manifest.json`) then it will be opened for viewing. 
Otherwise the file is expected to be an email with an attachment named `rsmf.zip`. 

### Online viewer

You can also use the viewer automatically installed via GitHub Pages at 

  https://shogun70.github.io/rsmf-viewer

## Implementation

The implementation contains three main components:

1. `viewer-hf.html` - Presents the content of the RSMF (default viewer, uses HyperFrameset).
2. `viewer-vue.html` - Alternative viewer using Vue.js.
3. `index.html` - Enables choosing, unzipping, and checking the `rsmf.zip`. 
4. `serviceworker.js` - Intercepts HTTP requests so that the viewer receives content extracted from the `rsmf.zip` chosen in `index.html`.

### Viewers
The default viewer is `viewer-hf.html`. To use the Vue-based viewer instead, load:

    http://localhost:8000/index.html?viewer=viewer-vue.html

Each viewer page looks for a sub-directory which contains the unzipped contents of the `rsmf.zip` file.
By default this sub-directory is `data/` but it can be configured by loading the page like: 
    http://localhost:8000/viewer-hf.html?data=alternate-data
This would allow you to manually unzip the `rsmf.zip` file into a sub-directory and test with it specifically.

### `index.html`
This page starts with a dialog prompting the user to choose an `rsmf.zip` file. 
When the file is chosen it is extracted, checked for validity, then stashed in [Origin Private FileSystem](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
to be accessed by the [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Once the RSMF contents are stashed this opens the viewer in an `<iframe>` with a unique `@src` pointing to the stashed data, e.g.
    http://localhost:8000/viewer-hf.html?data=rsmf/20240805080837/


## Licensing

This software is released with MIT license. 
It also utilizes other software under different licenses:

- HyperFrameset (includes behaviors): https://github.com/meekostuff/HyperFrameset/blob/main/LICENSE.txt (MPL-2.0)
- Dexie.js: https://github.com/dexie/Dexie.js/blob/master/LICENSE (Apache-2.0)
- Vue.js: https://github.com/vuejs/core/blob/main/LICENSE (MIT)
- Ndesmic Zip.js: https://github.com/ndesmic/zip/blob/main/license (MIT)
- PostalSys postal-mime.js: https://github.com/postalsys/postal-mime/blob/master/LICENSE.txt (MIT)