#!/bin/bash

# Kill ipfs
pkill ipfs
# Kill ganache
kill $(lsof -t -i:8545)

ganache -m "knock adjust glance excite point model dish armed diagram mimic secret wear" &
ipfs daemon &

# Wait for ganache & IPFS to be initialized
sleep 10

yarn contracts:deploy-all-local;
yarn contracts:deploy-dummy-nfts-local;
yarn db:migrate-reset-force;
yarn db:migrate-deploy;