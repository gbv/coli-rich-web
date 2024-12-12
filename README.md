# coli-rich Web Interface

<!-- [![Status](https://coli-conc-status.fly.dev/api/badge/29/status)](https://coli-conc-status.fly.dev/status/all) -->
[![License](https://img.shields.io/github/license/gbv/coli-rich-web.svg)](https://github.com/gbv/coli-rich-web/blob/main/LICENSE)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg)](https://github.com/RichardLitt/standard-readme)

Web service for enriching subject indexing data on the basis of mappings.

Note: This is currently a preview with no capability to write back into the catalogue.

## Table of Contents
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [To-Dos](#to-dos)
- [Maintainers](#maintainers)
- [Contribute](#contribute)
- [License](#license)

## Install
Requires Node.js 20+.

```bash
git clone https://github.com/gbv/coli-rich-web.git
cd coli-rich-web
npm ci
```

To run the development server on port 3454:

```bash
npm run dev
```

To run the production server, you need to build the Vue.js frondend first, then start the server:

```bash
npm run build
npm run start
```

## Usage

There is an input form to give a PPN from K10plus catalogue.

- The PPN is looked up via **subjects API** to get a list of concepts, the record is indexed with (e.g. DDC Numbers, BK Notations...)
- Each subject is then queried to get mappings from via **JSKOS API** and corresponding enrichments
- Enrichments can be selected
- *Writing selected enrichment back to K10plus has not been implemented yet*

## Configuration

Configuration can be adjusted via a `.env` file. Variables prefixed with `VITE_` can be used in the client as well.

```env
PORT=3454
# Full base URL on which your app will be hosted
BASE_URL=https://coli-conc.gbv.de/coli-rich/app/
# Login Server instance base URL
VITE_LOGIN_SERVER=http://localhost:3004
# Hardcoded list of allowed user URIs that can perform enrichments in the backend
VITE_ALLOWED_USERS=uri1,uri2
# List of allowed provider IDs (works in addition to VITE_ALLOWED_USERS, i.e. if a user either has one of the 
# specified URIs or has one of the specified providers linked, they can perform enrichments in the backend)
VITE_ALLOWED_PROVIDERS=provider1,provider2
# Local file path where submitted enrichments will be temporarily stored
ENRICHMENTS_PATH=./enrichments
```

## To-Dos
- [ ] Code cleanup
  - [ ] Split App.vue into multiple components
  - [ ] Simplify code where necessary
  - [ ] Separate configuration
- [ ] Add more examples?
- [ ] Fix concept data for Wikidata, STW, ...
- [ ] Add favicon
- [ ] ...

## Maintainers
- [@stefandesu](https://github.com/stefandesu)

## Contribute
PRs accepted.

<!-- - Please use the `dev` branch as a basis. Changes from `dev` will be merged into `main` only for new releases.
- Please run the tests before committing.
- Please do not skip the pre-commit hook when committing your changes.
- If editing the README, please conform to the [standard-readme](https://github.com/RichardLitt/standard-readme) specification. -->

<!-- ### Publish
**For maintainers only**

Please work on the `dev` branch during development (or better yet, develop in a feature branch and merge into `dev` when ready).

When a new release is ready (i.e. the features are finished, merged into `dev`, and all tests succeed), run the included release script (replace "patch" with "minor" or "major" if necessary):

```bash
npm run release:patch
```

This will:
- Check that we are on `dev`
- Run tests and build to make sure everything works
- Make sure `dev` is up-to-date
- Run `npm version patch` (or "minor"/"major")
- **Ask you to confirm the version**
- Push changes to `dev`
- Switch to `main`
- Merge changes from `dev`
- Push `main` with tags
- Switch back to `dev`

After running this, GitHub Actions will automatically create a new GitHub Release draft. Please edit and publish the release manually. -->

## License
MIT © 2024 Verbundzentrale des GBV (VZG)
