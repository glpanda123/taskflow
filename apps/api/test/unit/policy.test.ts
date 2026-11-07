/**
 * The permission table from src/access/policy.ts, one test per cell.
 * If a rule changes, change the table here first, then the function.
 */
import { describe, expect, it } from 'vitest';
import { type Action, type Decision, type Facts, decide } from '../../src/access/policy';

const cases: [Action, Facts, Decision][] = [
  // project:list: every member may list (viewers get a filtered list, done in the query)
  ['project:list', { role: 'owner' }, 'allow'],
  ['project:list', { role: 'admin' }, 'allow'],
  ['project:list', { role: 'member' }, 'allow'],
  ['project:list', { role: 'viewer' }, 'allow'],
  ['project:list', { role: null }, 'not-found'],

  // project:create: owner and admin only
  ['project:create', { role: 'owner' }, 'allow'],
  ['project:create', { role: 'admin' }, 'allow'],
  ['project:create', { role: 'member' }, 'forbidden'],
  ['project:create', { role: 'viewer' }, 'forbidden'],
  ['project:create', { role: null }, 'not-found'],

  // project:read: viewers only for projects they were invited to
  ['project:read', { role: 'owner' }, 'allow'],
  ['project:read', { role: 'admin' }, 'allow'],
  ['project:read', { role: 'member' }, 'allow'],
  ['project:read', { role: 'viewer', invitedToProject: true }, 'allow'],
  ['project:read', { role: 'viewer', invitedToProject: false }, 'not-found'],
  ['project:read', { role: 'viewer' }, 'not-found'],
  ['project:read', { role: null }, 'not-found'],
  // being on a project's viewer list doesn't help someone who left the workspace
  ['project:read', { role: null, invitedToProject: true }, 'not-found'],

  // task:create: anyone who works in the workspace; a viewer can see but not write
  ['task:create', { role: 'owner' }, 'allow'],
  ['task:create', { role: 'admin' }, 'allow'],
  ['task:create', { role: 'member' }, 'allow'],
  ['task:create', { role: 'viewer', invitedToProject: true }, 'forbidden'],
  // a viewer who can't even see the project must not learn it exists
  ['task:create', { role: 'viewer', invitedToProject: false }, 'not-found'],
  ['task:create', { role: null }, 'not-found'],

  // task:update: the same people who may create may edit
  ['task:update', { role: 'owner' }, 'allow'],
  ['task:update', { role: 'admin' }, 'allow'],
  ['task:update', { role: 'member' }, 'allow'],
  ['task:update', { role: 'viewer', invitedToProject: true }, 'forbidden'],
  ['task:update', { role: 'viewer', invitedToProject: false }, 'not-found'],
  ['task:update', { role: null }, 'not-found'],
];

describe('decide()', () => {
  it.each(cases)('%s as %o → %s', (action, facts, expected) => {
    expect(decide(action, facts)).toBe(expected);
  });
});
