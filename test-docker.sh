#!/bin/bash 
docker container start lil-marky
docker exec -t lil-marky npm run test
