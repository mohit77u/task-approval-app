import { describe, expect, it } from 'vitest';
import { successMessageFor } from './apiMessages';

describe('successMessageFor', () => {
  it('has a message for every mutation endpoint', () => {
    for (const endpoint of ['login', 'logout', 'createTask', 'updateTask', 'deleteTask', 'createComment', 'createUser', 'updateUser', 'deleteUser']) {
      expect(successMessageFor(endpoint, undefined)).toEqual(expect.any(String));
    }
  });

  it('words each workflow step specifically', () => {
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING', to: 'IN_PROGRESS' })).toBe('Task moved to In Progress');
    expect(successMessageFor('transitionTask', { id: 1, from: 'IN_PROGRESS', to: 'PENDING_APPROVAL' })).toBe('Submitted for approval');
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING_APPROVAL', to: 'COMPLETED' })).toBe('Task approved');
    expect(successMessageFor('transitionTask', { id: 1, from: 'PENDING_APPROVAL', to: 'IN_PROGRESS' })).toBe('Task sent back to In Progress');
  });

  it('is silent for queries and the session bootstrap', () => {
    expect(successMessageFor('listTasks', {})).toBeUndefined();
    expect(successMessageFor('me', undefined)).toBeUndefined();
  });
});
