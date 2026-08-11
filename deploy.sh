#!/bin/bash

# Function to execute commands with logging
execute_command() {
    local command="$1"
    echo "Executing: $command"
    if eval "$command"; then
        echo "Command executed successfully"
    else
        echo "Error executing command: $command" >&2
        exit 1
    fi
}

# Image tag to deploy (defaults to latest; pass a specific tag, e.g. sha-<commit-sha>, to roll back).
# A bare 40-char commit SHA is normalized to the sha-<commit-sha> tag docker/metadata-action pushes.
image_tag="${1:-latest}"
if [[ "$image_tag" =~ ^[0-9a-f]{40}$ ]]; then
    image_tag="sha-${image_tag}"
fi
export MAPS_IMAGE_TAG="$image_tag"

# Start deploy maps script
echo "Start deploy maps script (image tag: $MAPS_IMAGE_TAG)."

# The refreshed statistics cprod.yml bind-mounts (see .github/workflows/refresh-data.yml).
# Created here, as the deploying user, because Docker would otherwise create the missing
# bind-mount source itself and own it as root — after which the refresh script, running over
# SSH as this same unprivileged user, could no longer write into it. An empty or absent
# directory is harmless: nginx falls back to the copy baked into the image.
mkdir -p data

# Commands to execute
compose_down="docker compose -f cprod.yml down"
compose_pull="docker compose -f cprod.yml pull"
compose_up="docker compose -f cprod.yml up -d"

# Execute the commands
execute_command "$compose_down"
execute_command "$compose_pull"
execute_command "$compose_up"

# Clean up images left behind by the deploy
echo 'Cleaning up unused images.'
execute_command "docker image prune -f"

# Compare full-length IDs from docker inspect/--no-trunc; short IDs from different
# docker/compose commands aren't guaranteed to be formatted consistently.
running_image_id=$(docker inspect --format '{{.Image}}' maps)
old_maps_image_ids=$(docker images oskarwestmeijer/maps --no-trunc --format '{{.ID}}' | sort -u | grep -vF "$running_image_id")
if [ -n "$old_maps_image_ids" ]; then
    execute_command "docker image rm -f $(echo "$old_maps_image_ids" | tr '\n' ' ')"
else
    echo 'No unused maps images to remove.'
fi

# Finish deploy maps script
echo 'Finish deploy maps script.'
