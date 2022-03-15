#!/bin/bash

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# Copy in the correct config for the stage of the pipeline being deployed
#
if [ "$STAGE" == 'deployed' ]; then
    cp environments/config.deployed.json config.json
else
    cp environments/config.local.json config.json
fi