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

## Usage
To run the development server on port 3454:

```bash
npm run dev
```

To build the web app into the `dist/` directory:

```bash
npm run build
```

## Configuration
Currently not applicable, but will be relevant when a server component is added.

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
