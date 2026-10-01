export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode: number = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function notFound(code: string, message: string): AppError {
  return new AppError(code, message, 404);
}

export function conflict(code: string, message: string): AppError {
  return new AppError(code, message, 409);
}

export function unauthorized(code: string, message: string): AppError {
  return new AppError(code, message, 401);
}
