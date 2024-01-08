#!/usr/bin/env bash

args=("$@")

DPI=""
no_env=false

# Parse named parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --dpi=*)
            export GDK_DPI_SCALE="${1#*=}"
            ;;
        --no-env)
            no_env=true
            ;;
        *)
            ;;
    esac
    shift
done
export GDK_SCALE=$(awk "BEGIN {print 1/$GDK_DPI_SCALE}")

pnpm gulp --state=development

if [ "$no_env" = true ]; then
    echo ".env configuration will not be passed"
    electron ./build/electron-preload.js ${args[@]}
else
    echo ".env configuration will be passed"
    [ ! -f .env ] || export $(grep -v "^#" .env | xargs)
    electron ./build/electron-preload.js --name=$BOT_NAME --pass=$BOT_PSWD --server=$SERVER ${args[@]}
fi
