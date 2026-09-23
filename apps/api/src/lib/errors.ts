/**
 * Error types whose messages are safe to show a non-technical operator.
 */

import type { ApiError } from '@sensi/shared';

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toResponse(): ApiError {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, 'bad_request', message, details);

export const notFound = (message: string): HttpError => new HttpError(404, 'not_found', message);

export const notImplemented = (message: string): HttpError =>
  new HttpError(501, 'not_implemented', message);

/** The request is valid but the thing it asks for is not ready yet. */
export const conflict = (message: string): HttpError => new HttpError(409, 'conflict', message);

export const upstreamUnavailable = (message: string, details?: unknown): HttpError =>
  new HttpError(503, 'upstream_unavailable', message, details);
