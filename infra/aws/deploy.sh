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
# Remember the release in .env, so later Compose commands (logs, restart) still work.
sed -i '/^API_IMAGE=/d' .env
echo "API_IMAGE=$image" >> .env

docker compose pull api
docker compose up -d db
docker compose up -d --no-deps caddy
# A changed Caddyfile is not a Compose change, so tell the running Caddy to reload it.
reloaded=no
for _ in $(seq 1 10); do
  if docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    reloaded=yes
    break
  fi
  sleep 1
done
[ "$reloaded" = yes ] || { echo "Caddy did not reload its config" >&2; exit 1; }
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
