# Demo server on AWS

The demo runs on the **fallback profile of [ADR-002](../../docs/architecture/adr/ADR-002-infrastructure.md)**:
one EC2 instance with Docker Compose. The ECS + RDS + load balancer design priced at ~$65–70 a month
in Singapore, twice the $30 budget; this setup is ~$13 a month. The production profile in ADR-002
is unchanged and stays the answer to "how would you run this for real?".

| Piece          | What                                                                    | Why                                         |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| Server         | EC2 `t3.micro`, Amazon Linux 2023, 20 GB encrypted disk, 1 GB swap      | Cheapest instance that fits API + Postgres  |
| Runtime        | `compose.yaml`: Postgres 16, the API image, Caddy                       | One file describes the whole server         |
| HTTPS          | Caddy + Let's Encrypt for `<elastic-ip>.sslip.io`                       | A real certificate without buying a domain  |
| Images         | Amazon ECR `taskflow-api`, last 10 kept                                 | Private; the server pulls with its IAM role |
| Deploys        | GitHub Actions → OIDC role → SSM Run Command → `deploy.sh`              | No SSH port, no AWS keys stored in GitHub   |
| Secrets        | `POSTGRES_PASSWORD`, `JWT_SECRET` generated on the server at first boot | They never leave the instance               |
| Infrastructure | `taskflow-demo.yaml` (CloudFormation)                                   | Created and deleted in one step             |

Deploy order (`deploy.sh`): pull the new image → start Postgres and Caddy → run migrations with the
new image → start the new API → wait until it answers.

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

4. **Actions → Deploy API → Run workflow** on `master`. Later merges that touch the API deploy by themselves.
5. Open the stack output `ApiBaseUrl` + `/me`: a JSON 401 problem means the API is live over HTTPS.

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
- **Look at the data:** see the next section.
- **Pause between interviews:** stop the instance (the Elastic IP and disk still cost ~$5/month).
  Start it again and the containers come back on their own.
- **Remove everything:** delete the stack. The ECR repository must be empty first
  (delete its images in the ECR console).

## AI drafting key

Task drafting calls Claude with the key in `/opt/taskflow/.env`. Without it the API runs
and `POST /projects/{id}/task-drafts` answers 503. To turn drafting on, add the line below on
the server (EC2 → the instance → Connect → _Session Manager_, `sudo nano /opt/taskflow/.env`),
then run the deploy again. Use a key made for this server only, so it can be revoked alone.

```
ANTHROPIC_API_KEY=<the server's key>
```

## Look at the data

Postgres listens on the server's `127.0.0.1:5432` only. A Session Manager port-forwarding
session carries it to a port on your laptop, through the same SSM channel as the deploys:
no open port, no SSH.

Once per machine:

1. Install the [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)
   and the [Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).
2. Sign the CLI in with your own AWS user (`aws configure sso`, or `aws configure` with the
   keys of an IAM user that may start sessions). Region `ap-southeast-1`.
3. Read the database password on the server (EC2 → the instance → Connect → _Session Manager_):
   `sudo grep POSTGRES_PASSWORD /opt/taskflow/.env`. Keep it in your password manager.

Each time:

```bash
aws ssm start-session --region ap-southeast-1 --target <InstanceId> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["5432"],"localPortNumber":["5433"]}'
```

Leave it running, then connect any client to `localhost:5433`, database `taskflow`, user
`taskflow`. From the repository, Prisma Studio needs nothing else:

```bash
DATABASE_URL="postgresql://taskflow:<password>@localhost:5433/taskflow" \
  pnpm --filter @taskflow/api exec prisma studio
```

This is the production database: read freely, change rows through the API.

## Known limits of the demo profile

- One server, one availability zone: a reboot is downtime.
- Postgres lives on the instance disk with no automated backups yet. Next step: a nightly
  `pg_dump` to S3, or EBS snapshots through Data Lifecycle Manager.
- Realtime works because there is one API instance: who watches which board is kept in its
  memory. Redis pub/sub and the outbox come next, as a `redis` service in `compose.yaml`.
