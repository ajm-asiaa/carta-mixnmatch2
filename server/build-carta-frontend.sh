#/bin/bash

echo 'Building a production frontend from Github using Docker.'
cd /var/www/mixnmatch2/frontend/
mkdir $1
cd $1
git clone https://github.com/CARTAvis/carta-frontend.git
cd carta-frontend
git checkout $1
git submodule update --init --recursive
npm install
npm run build-libs-docker
npm run build-docker

mv build/* ../
cd ..
rm -rf carta-frontend

#sleep 20

echo 'frontend built'
