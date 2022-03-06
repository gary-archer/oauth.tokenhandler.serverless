
#!/bin/bash

######################################################
# A script to run the lambda cookie authorizer locally
######################################################

SLS=./node_modules/.bin/sls

cd "$(dirname "${BASH_SOURCE[0]}")"
cd ..

echo 'Calling cookie authorizer with secure cookies ...'
$SLS invoke local -f cookieAuthorizer -p test/data/cookieAuthorizer.json
if [ $? -ne 0 ]; then
  echo 'Problem encountered calling cookie authorizer'
  exit
fi

echo 'Lambda authorizer completed successfully'
