# RSMF Viewer

Viewer for [rsmf.zip](https://help.relativity.com/RelativityOne/Content/System_Guides/Relativity_Short_Message_Format/Processing_an_RSMF_file.htm#RSMFzip) files.

**WARNING: This is a work-in-progress. Don't rely on this tool for any forensic activity.**

## Installation

The RSMF Viewer is a single-page web application (currently supports recent Chrome and Firefox, but not Safari). 
It has no server-side code but it must be delivered from a web-server (presumably on the localhost) 
since it makes use of features which require [secure web context](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts).

Download the code to a directory and then use a [static http server](https://gist.github.com/willurd/5720255) to serve that directory on localhost.
(There are also numerous static and simple http servers which can be installed or your IDE may provide this functionality.)

Assuming the directory is being served from `http://localhost:8000/` then open a new browser tab and navigate to:

  http://localhost:8000/index.html

This page will prompt you to choose a `rsmf.zip` file. 
If the file looks like a valid RSMF Zip (i.e. it contains `rsmf_manifest.json`) then it will be opened for viewing.

### Online viewer

You can also use the viewer automatically installed via GitHub Pages at 

  https://shogun70.github.io/rsmf-viewer

## Implementation

The implementation contains three main components:

1. `viewer.html` - Presents the content of the RSMF.
2. `index.html` - Enables choosing, unzipping, and checking the `rsmf.zip`. 
3. `serviceworker.js` - Intercepts HTTP requests so that `viewer.html` receives content extracted from the `rsmf.zip` chosen in `index.html`.

### `viewer.html`
This page looks for a sub-directory which contains the unzipped contents of the `rsmf.zip` file.
By default this sub-directory is `data/` but it can be configured by loading the page like: 
    http://localhost:8000/viewer.html?data=alternate-data
This would allow you to manually unzip the `rsmf.zip` file into a sub-directory and test with it specifically.

### `index.html`
This page starts with a dialog prompting the user to choose an `rsmf.zip` file. 
When the file is chosen it is extracted, checked for validity, then stashed in [Origin Private FileSystem](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
to be accessed by the [Service Worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

Once the RSMF contents are stashed this opens `viewer.html` in an `<iframe>` with a unique `@src` pointing to the stashed data, e.g.
    http://localhost:8000/viewer.html?data=rsmf/20240805080837/


## Licensing

This software is released with MIT license. 
It also utilizes other software under the MIT license:

- Vue.js: https://github.com/vuejs/core/blob/main/LICENSE
- Ndesmic Zip.js: https://github.com/ndesmic/zip/blob/main/license