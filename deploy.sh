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

# Image tag to deploy (defaults to latest; pass a specific tag, e.g. sha-<commit-sha>, to roll back)
export MAPS_IMAGE_TAG="${1:-latest}"

# Start deploy maps script
echo "Start deploy maps script (image tag: $MAPS_IMAGE_TAG)."

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

running_image_id=$(docker compose -f cprod.yml images -q maps)
old_maps_image_ids=$(docker images oskarwestmeijer/maps --format '{{.ID}}' | sort -u | grep -v "^${running_image_id}$")
if [ -n "$old_maps_image_ids" ]; then
    execute_command "docker image rm -f $(echo "$old_maps_image_ids" | tr '\n' ' ')"
else
    echo 'No unused maps images to remove.'
fi

# Finish deploy maps script
echo 'Finish deploy maps script.'
