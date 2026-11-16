# Demo server on AWS

The demo runs on the **fallback profile of [ADR-002](../../docs/architecture/adr/ADR-002-infrastructure.md)**:
one EC2 instance with Docker Compose, and Postgres on Neon (managed, free plan). The ECS + RDS + load balancer design priced at ~$65–70 a month
in Singapore, twice the $30 budget; this setup is ~$13 a month. The production profile in ADR-002
is unchanged and stays the answer to "how would you run this for real?".

| Piece          | What                                                                   | Why                                         |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| Server         | EC2 `t3.micro`, Amazon Linux 2023, 20 GB encrypted disk, 1 GB swap     | Cheapest instance that fits the API         |
| Runtime        | `compose.yaml`: the API image, Caddy                                   | One file describes the whole server         |
| Database       | Neon Postgres in `ap-southeast-1`, pooled address for the app          | Backups and a web console to look at data   |
| HTTPS          | Caddy + Let's Encrypt for `<elastic-ip>.sslip.io`                      | A real certificate without buying a domain  |
| Images         | Amazon ECR `taskflow-api`, last 10 kept                                | Private; the server pulls with its IAM role |
| Deploys        | GitHub Actions → OIDC role → SSM Run Command → `deploy.sh`             | No SSH port, no AWS keys stored in GitHub   |
| Secrets        | `JWT_SECRET` generated at first boot; database addresses added by hand | Only in `/opt/taskflow/.env`, root-only     |
| Infrastructure | `taskflow-demo.yaml` (CloudFormation)                                  | Created and deleted in one step             |

Deploy order (`deploy.sh`): pull the new image → start Caddy → run migrations with the new image
(over the direct database address) → start the new API → wait until it answers.

## First-time setup

1. **CloudFormation** (region `ap-southeast-1`) → Create stack → _Upload a template file_ →
   `infra/aws/taskflow-demo.yaml` → stack name `taskflow-demo` → keep the defaults → tick
   _I acknowledge that AWS CloudFormation might create IAM resources_ → Submit.
   (If the account already has a GitHub OIDC provider, set `CreateGitHubOidcProvider` to `false`.)
2. Wait for `CREATE_COMPLETE`, then about 3 more minutes for the first boot to install Docker.
3. Copy three values into the repository's **Settings → Secrets and variables → Actions → Variables**:

   | Variable              | Value                        |
   | --------------------- | ---------------------------- |
   | `AWS_REGION`          | `ap-southeast-1`             |
   | `AWS_DEPLOY_ROLE_ARN` | stack output `DeployRoleArn` |
   | `AWS_INSTANCE_ID`     | stack output `InstanceId`    |

4. **Database** (Neon): create a project in region _AWS Asia Pacific (Singapore)_ with Postgres 16.
   In its SQL editor run `CREATE EXTENSION IF NOT EXISTS citext;`. From _Connect_, copy two
   connection strings: with _Connection pooling_ on (the host contains `-pooler`) and with it off.
   On the server (EC2 → the instance → Connect → _Session Manager_) add them to the env file:

   ```bash
   sudo nano /opt/taskflow/.env
   # add two lines, no quotes:
   # DATABASE_URL=<the pooled string>
   # DIRECT_URL=<the direct string>
   ```

   These strings contain the database password: they belong in that file and nowhere else.

5. **Actions → Deploy API → Run workflow** on `master`. Later merges that touch the API deploy by themselves.
6. Open the stack output `ApiBaseUrl` + `/me`: a JSON 401 problem means the API is live over HTTPS.

## If the deploy fails with "Not authorized to perform sts:AssumeRoleWithWebIdentity"

The role's trust policy compares the token's `sub` claim with the stack parameter
`GitHubSubject`, and they differ. Find the real value in **CloudTrail → Event history**
(same region): event name `AssumeRoleWithWebIdentity`, field `userIdentity.userName`.
Then CloudFormation → the stack → Update → _Use existing template_ → set `GitHubSubject`
to that value. Repositories created after July 2026 use
`repo:OWNER@OWNER_ID/NAME@REPO_ID:ref:refs/heads/master`.

## Day to day

- **Logs:** EC2 → the instance → Connect → _Session Manager_, then
  `cd /opt/taskflow && sudo docker compose logs -f api`.
- **Look at the data:** the Neon console (_Tables_ or the SQL editor). Read-only habits:
  the app owns the schema, so change rows through the API, not by hand.
- **Pause between interviews:** stop the instance (the Elastic IP and disk still cost ~$5/month).
  Start it again and the containers come back on their own.
- **Remove everything:** delete the stack. The ECR repository must be empty first
  (delete its images in the ECR console).

## Known limits of the demo profile

- One server, one availability zone: a reboot is downtime.
- The database is on Neon's free plan: it sleeps after a few idle minutes, so the first
  request after a pause takes about a second longer, and storage is limited.
- Realtime works because there is one API instance: who watches which board is kept in its
  memory. Redis pub/sub and the outbox come next, as a `redis` service in `compose.yaml`.

## Moving an existing server from the Postgres container to Neon

Before 2026-11-16 Postgres ran as a container on the instance. To move: do step 4 above,
then merge or run the deploy. `deploy.sh` stops the old `db` container; its data stays in
the Docker volume `taskflow_db-data` until you remove it (`sudo docker volume rm taskflow_db-data`).
If the two variables are missing, the deploy stops before changing anything and the old
containers keep running.
