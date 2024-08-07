#!/bin/bash

SECRETS=$1

exclude_vars=(
  "CAEXTERNALDEVEASTUS2001_AZURE_CREDENTIALS"
  "CAEXTERNALDEVEASTUS2001_REGISTRY_PASSWORD"
  "CAEXTERNALDEVEASTUS2001_REGISTRY_USERNAME"
  "CAN8NPRODEASTUS2001_AZURE_CREDENTIALS"
  "CAN8NPRODEASTUS2001_REGISTRY_PASSWORD"
  "CAN8NPRODEASTUS2001_REGISTRY_USERNAME"
)

jq_filter=$(printf 'select(.key != "%s") | ' "${exclude_vars[@]}")
jq_filter="${jq_filter::-3}"

env_vars=$(echo "$SECRETS" | jq -r "to_entries | map($jq_filter) | map(\"\(.key)=\(.value)\") | join(\" \")")

az containerapp update -n ca-n8n-prod-eastus2-001 -g rg-startse-prod-eastus2 --set-env-vars $env_vars
