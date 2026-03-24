#!/bin/bash

# Create directories
mkdir -p "app/(auth)"
mkdir -p "app/(app)/profile"
mkdir -p "app/(app)/event"
mkdir -p components
mkdir -p lib
mkdir -p hooks
mkdir -p types
mkdir -p constants

# Auth screens
touch "app/(auth)/_layout.tsx"
touch "app/(auth)/login.tsx"
touch "app/(auth)/register.tsx"

# App screens
touch "app/(app)/_layout.tsx"
touch "app/(app)/index.tsx"
touch "app/(app)/create.tsx"
touch "app/(app)/profile/index.tsx"
touch "app/(app)/profile/[id].tsx"
touch "app/(app)/event/[id].tsx"

# Components
touch "components/EventCard.tsx"
touch "components/Button.tsx"
touch "components/Input.tsx"

# Hooks
touch "hooks/useAuth.ts"
touch "hooks/useEvents.ts"

# Types and constants
touch "types/index.ts"
touch "constants/index.ts"

echo "vclub folder structure created successfully!"