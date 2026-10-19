#!/usr/bin/env bash
set -euo pipefail

# Local: ./build-and-push.sh
# Publish: SEEKFEED_IMAGE=registry.example.com/account/seekfeed ./build-and-push.sh --push
IMAGE="${SEEKFEED_IMAGE:-seekfeed}"
TAG="${SEEKFEED_TAG:-latest}"
MODE="${1:-build}"
if [[ "$MODE" != "build" && "$MODE" != "--push" ]]; then
    echo "Usage: ./build-and-push.sh [--push]" >&2
    exit 1
fi
if [[ "$MODE" == "--push" && "$IMAGE" != */* ]]; then
    echo "Set SEEKFEED_IMAGE to your registry/account/seekfeed before publishing." >&2
    exit 1
fi

docker build --tag "$IMAGE:$TAG" .
if [[ "$MODE" == "--push" ]]; then
    docker push "$IMAGE:$TAG"
fi
printf 'SeekFeed image: %s:%s\n' "$IMAGE" "$TAG"
