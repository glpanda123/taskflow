# ADR-002: Infrastructure

- Status: Accepted (Stage 3, 2026-10-28)
- Context docs: [01 — containers](../01-context-and-containers.md)

## Context

The target is 99.9% availability for ~35 requests/s and ~4k WebSocket connections (see the README). The reality is a portfolio project paid for out of pocket during a job search. The infrastructure has to show the production design without a production bill, and be reproducible.

## Decision

**Two profiles from the same setup**: a _demo_ profile that runs now, and a _production_ profile that differs only in sizes and counts.

| Piece                  | Choice                                                                                       | Demo profile                                          | Production profile                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| Web app                | Vercel (already in use)                                                                      | Hobby                                                 | Pro                                                    |
| API                    | Container on **AWS ECS Fargate** behind an **Application Load Balancer** (HTTPS + WebSocket) | 1 task, smallest size                                 | ≥ 2 tasks across 2 availability zones, rolling deploys |
| Worker                 | Same image, different command, on ECS Fargate                                                | 1 small task                                          | 1–2 tasks                                              |
| Database               | **Amazon RDS for PostgreSQL 16**                                                             | single-AZ, smallest burstable instance, 7-day backups | Multi-AZ, point-in-time recovery                       |
| Redis                  | **ElastiCache for Redis** (or a serverless Redis with a free tier for the demo)              | smallest node                                         | small node with a replica                              |
| Email                  | **Amazon SES**                                                                               | sandbox (verified addresses only)                     | production access                                      |
| Secrets                | AWS Secrets Manager / SSM Parameter Store                                                    | same                                                  | same                                                   |
| Logs and metrics       | CloudWatch; structured JSON logs                                                             | same                                                  | + alarms on 5xx rate, p95 latency, queue depth         |
| CI/CD                  | GitHub Actions builds one image, runs migrations, deploys                                    | same                                                  | + manual approval for production                       |
| Infrastructure as code | Console first to learn it; **Terraform** once it runs (post-03/11 queue)                     |                                                       |                                                        |
| Cost guard             | **AWS Budget alert** before the first resource is created                                    | $30/month alert                                       | per environment                                        |

## Options considered

| Option                                  | For                                                                                                        | Against                                                           | Verdict                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------- |
| **AWS (ECS Fargate, RDS, ElastiCache)** | What Hanoi job posts ask for; real load balancer, managed Postgres with backups; shows production thinking | Several always-on services cost money every hour; more setup      | **Chosen**, with a demo profile and a budget alert |
| Single VM (EC2) with Docker Compose     | Cheapest real server; simple                                                                               | No high availability; I'd run Postgres backups myself             | Fallback if the demo bill is too high              |
| Render / Railway / Fly.io               | Fast to set up, cheap at small sizes, managed Postgres                                                     | Less to talk about in AWS-heavy interviews; fewer knobs           | Good alternative; not chosen for portfolio reasons |
| Kubernetes (EKS)                        | Industry standard at scale                                                                                 | Far more than 3 containers need; control-plane cost               | Rejected                                           |
| Serverless API (Lambda)                 | Pay per request                                                                                            | Long-lived WebSockets and a polling worker fit badly; cold starts | Rejected                                           |

## Consequences

- The demo profile is **not** highly available (one API task, single-AZ database). The production profile is the documented answer to "how would you hit 99.9%?", and the difference is configuration, not code.
- Always-on pieces (load balancer, database, Redis) cost money even when idle; the demo stack can be stopped between interviews. Prices to be checked in the AWS pricing calculator before creating anything.
- The API stays stateless (JWTs, no local sessions), so adding tasks behind the load balancer needs no code change.
- Migrations run as a separate step in the deploy before new API tasks start; a migration must work with both the old and the new code (expand, then contract).
