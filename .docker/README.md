# coli-rich-web Docker

## Supported Architectures
Currently, only `x86-64` is supported.

<!-- ## Available Tags
- The current release version is available under `latest`. However, new major versions might break compatibility of the previously used config file, therefore it is recommended to use a version tag instead.
- We follow SemVer for versioning the application. Therefore, `x` offers the latest image for the major version x, `x.y` offers the latest image for the minor version x.y, and `x.y.z` offers the image for a specific patch version x.y.z.
- Additionally, the latest development version is available under `dev`. -->

## Usage
It is recommended to run the image using [Docker Compose](https://docs.docker.com/compose/). Note that depending on your system, it might be necessary to use `sudo docker compose`. For older Docker versions, use `docker-compose` instead of `docker compose`.

1. Create a `docker-compose.yml` file:

```yml
services:
  coli-rich-web:
    image: ghcr.io/gbv/coli-rich-web
    volumes:
      # Store the built site in a volume (optional, but prevents having to rebuild the site if the container is recreated)
      - ./data:/usr/src/app/dist
    environment:
      # See main README for explanation of configuration options
      - BASE=/
      - PORT=3454
      # When used in Docker, this needs to be a publicly available URL
      - VITE_LOGIN_SERVER=http://localhost:3004
    ports:
      - 3454:3454
    restart: unless-stopped
```

2. Start the container:

```sh
docker compose up -d
```

This will create and start a coli-rich-web container running under host (and guest) port 3454. See [Configuration](#configuration) on how to configure it.

You can now access the application under `http://localhost:3454`.

## Application Setup
After changing `docker-compose.yml` (e.g. adjusting environment variables), it is necessary to recreate the container to apply changes: `docker compose up -d`

### Configuration
You can use environment variables via `environment` to configure coli-rich-web. Please refer to the [main documentation](../README.md#configuration) for more information and all available options.
