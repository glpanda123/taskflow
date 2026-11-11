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

## Day to day

- **Logs:** EC2 → the instance → Connect → _Session Manager_, then
  `cd /opt/taskflow && sudo docker compose logs -f api`.
- **Pause between interviews:** stop the instance (the Elastic IP and disk still cost ~$5/month).
  Start it again and the containers come back on their own.
- **Remove everything:** delete the stack. The ECR repository must be empty first
  (delete its images in the ECR console).

## Known limits of the demo profile

- One server, one availability zone: a reboot is downtime.
- Postgres lives on the instance disk with no automated backups yet. Next step: a nightly
  `pg_dump` to S3, or EBS snapshots through Data Lifecycle Manager.
- No Redis yet; realtime adds a `redis` service to `compose.yaml`.
