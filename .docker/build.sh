#!/bin/bash

# We need to rebuild the front-end if environment differs from default

base_file=dist/.base
base="$BASE /// $VITE_LOGIN_SERVER"

if [[ -e $base_file && "$base" == "$(cat $base_file)" ]]; then
  echo "Front-end rebuild skipped."
else
  echo "Rebuilding front-end because configuration changed..."
  # Build the site
  npm run build
  # Remember the current environment
  echo "$base" > $base_file
fi
