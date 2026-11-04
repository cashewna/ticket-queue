export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(400, 'bad_request', message, details);
}

export function unauthorized(message = 'Sign in to continue.'): AppError {
  return new AppError(401, 'unauthorized', message);
}

export function forbidden(message = 'You do not have access to that.'): AppError {
  return new AppError(403, 'forbidden', message);
}

export function notFound(message = 'Not found.'): AppError {
  return new AppError(404, 'not_found', message);
}

export function conflict(
  message: string,
  code = 'conflict',
  details?: unknown,
): AppError {
  return new AppError(409, code, message, details);
}

export function unprocessable(message: string, details?: unknown): AppError {
  return new AppError(422, 'validation_failed', message, details);
}
