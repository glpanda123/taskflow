#!/usr/bin/env bash
# Runs ON the server, sent by the "Deploy API" workflow through AWS SSM Run Command:
#   bash deploy.sh <image>   e.g. 1234.dkr.ecr.ap-southeast-1.amazonaws.com/taskflow-api:<sha>
# Order (ADR-002): pull the new image, run migrations, then start the new API.
set -euo pipefail
cd /opt/taskflow
image="$1"
registry="${image%%/*}"
region="$(echo "$registry" | cut -d. -f4)"

aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "$registry"
export API_IMAGE="$image"

docker compose pull api
docker compose up -d db
docker compose up -d --no-deps caddy
# Migrations first, with the NEW image, before the new API starts.
docker compose run --rm api ./node_modules/.bin/prisma migrate deploy
docker compose up -d api

# Healthy = the API answers (an anonymous GET /me is a 401 problem).
for _ in $(seq 1 30); do
  code="$(docker compose exec -T api node -e \
    "fetch('http://localhost:3001/api/v1/me').then(r=>console.log(r.status)).catch(()=>console.log(0))")"
  if [ "$code" = "401" ]; then
    echo "API is up: $image"
    docker image prune -af --filter "until=168h" >/dev/null || true
    exit 0
  fi
  sleep 2
done
echo "API did not become healthy" >&2
docker compose logs --tail 50 api >&2
exit 1
