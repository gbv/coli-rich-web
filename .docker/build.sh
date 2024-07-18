#!/bin/bash

# Clone site if not yet done
if [ ! -e .git ]; then
  git init -b main
  git remote add origin https://github.com/gbv/coli-rich-web.git
  git fetch
  git checkout -t origin/main
fi

# Pull changes
git pull

env () {
  echo "$(git rev-parse HEAD) ### $BASE"
}
env_file=dist/.build-env

if [ -e $env_file ] && [ "$(env)" == "$(cat $env_file)" ]; then
  echo "Site rebuild skipped because there was no update."
else
  # Might need to update dependencies after each pull
  npm ci
  # Build the site
  npm run build
  # Remember the current commit
  env > $env_file
fi
