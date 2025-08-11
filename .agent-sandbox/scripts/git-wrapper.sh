#!/bin/bash

# Git wrapper to prevent certain dangerous operations
# This wrapper is installed in the container's PATH before the real git

# Check for disallowed patterns
if [[ "$*" =~ commit.*(--no-verify|-n([[:space:]]|$)) ]]; then
    echo "Error: Use of --no-verify/-n is not allowed. If you are blocked on a precommit check, please escalate to the user for guidance." >&2
    exit 1
fi

if [[ "$*" =~ push.*(--force|--force-with-lease) ]]; then
    echo "Error: Force pushes are not allowed. If you feel this is necessary, please escalate to the user for guidance." >&2
    exit 1
fi

# Execute the real git command
exec /usr/bin/git "$@"