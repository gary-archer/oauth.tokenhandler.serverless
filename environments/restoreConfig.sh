#!/bin/bash

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

#
# Restore development configuration after deploying
#
cp environments/config.local.json config.json
