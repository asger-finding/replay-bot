#!/usr/bin/env bash

args=("$@")

GDK_DPI_SCALE=1
GDK_SCALE=1
no_env=false

# Parse named parameters
while [[ "$#" -gt 0 ]]; do
    case "$1" in
        --dpi=*)
            export GDK_DPI_SCALE="${1#*=}"
            export GDK_SCALE=$(awk "BEGIN {print 1/$GDK_DPI_SCALE}")
            ;;
        --no-env)
            no_env=true
            ;;
        *)
            ;;
    esac
    shift
done

exit_script()
{
    # Setup recording directory
    mkdir -p recordings

    VIDEO_NAME=Video_$(date +"%Y-%m-%d_%H-%M-%S")

    ffmpeg -i /tmp/com.asger.replayhawk/list.m3u8 -c copy recordings/$VIDEO_NAME.mp4 &&
    ffplay recordings/$VIDEO_NAME.mp4
}

trap exit_script SIGINT SIGTERM

record()
{
    SEGMENTS=6
    SEG_LENGTH=4

    # Clear replay buffer cache
    rm -rf /tmp/com.asger.replayhawk/*

    # Setup buffer directory
    mkdir -p /tmp/com.asger.replayhawk

    # Record to replay ring buffer
    ffmpeg -f x11grab -i :99.0 \
        -force_key_frames expr:gte\(t,n_forced*$SEG_LENGTH\) \
        -c:v libx264 -c:a aac \
        -metadata service_name=$(date +%s) \
        -f segment -segment_time $SEG_LENGTH \
        -segment_wrap $SEGMENTS \
        -segment_list_size $SEGMENTS \
        -segment_list /tmp/com.asger.replayhawk/list.m3u8 \
        /tmp/com.asger.replayhawk/segment_%d.ts
}

pnpm gulp --state=development

if [ "$no_env" = true ]; then
    echo ".env configuration will not be passed"
    xvfb-run --server-args="-nocursor -screen 0 1280x720x24" \
    electron ./build/electron-preload.js ${args[@]} \
    & record && fg
else
    echo ".env configuration will be passed"
    [ ! -f .env ] || export $(grep -v "^#" .env | xargs)
    xvfb-run --server-args="-nocursor -screen 0 1280x720x24" \
    electron ./build/electron-preload.js --name=$BOT_NAME --pass=$BOT_PSWD --server=$SERVER ${args[@]} \
    & record && fg
fi

# ffmpeg -i your_input -f segment -strftime 1 -segment_time 60 -segment_format mp4 out%Y-%m-%d_%H-%M-%S.mp4
