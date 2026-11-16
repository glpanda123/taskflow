/**
 * The secret in an invitation link. Like a refresh token: a long random string that
 * the server never stores. The database keeps its SHA-256 hash, so reading the
 * database doesn't let anyone join a workspace.
 */
import { createHash, randomBytes } from 'node:crypto';

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const newInvitationToken = () => randomBytes(32).toString('base64url');

export const hashInvitationToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
