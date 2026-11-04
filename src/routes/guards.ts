import type { FastifyRequest } from 'fastify';
import { forbidden, unauthorized } from '../domain/errors.js';
import type { User } from '../domain/types.js';

export function requireUser(request: FastifyRequest): User {
  if (request.currentUser === null) {
    throw unauthorized('Sign in to continue.');
  }
  return request.currentUser;
}

export function requireAgent(request: FastifyRequest): User {
  const user = requireUser(request);
  if (user.role !== 'agent') {
    throw forbidden('Only agents can perform that action.');
  }
  return user;
}
