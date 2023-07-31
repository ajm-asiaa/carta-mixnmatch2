#!/bin/bash

echo "build backend"
echo 'Building a backend from Github'
cd /var/www/mixnmatch2/backend/
mkdir $1
cd $1
git clone https://github.com/CARTAvis/carta-backend.git
cd carta-backend
git checkout $1
git submodule update --init --recursive
mkdir build
cd build
cmake .. -DEnableAvx=On
make -j 8

mv carta_backend ../../
cd ../../
rm -rf carta-backend

#sleep 10

echo 'backend built'
