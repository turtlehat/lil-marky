#!/bin/bash 
docker build -t lil-marky:latest .
docker run -dit -v $(pwd):/app --name lil-marky lil-marky:latest
docker exec -t lil-marky npm install