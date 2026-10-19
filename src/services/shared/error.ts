export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 400,
    code = "BAD_REQUEST",
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super(message, 400, "BAD_REQUEST", details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized", details?: unknown) {
    super(message, 401, "UNAUTHORIZED", details);
  }
}

export class PaymentRequiredError extends AppError {
  constructor(message = "Payment required / insufficient credits", details?: unknown) {
    super(message, 402, "PAYMENT_REQUIRED", details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden", details?: unknown) {
    super(message, 403, "FORBIDDEN", details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found", details?: unknown) {
    super(message, 404, "NOT_FOUND", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = "Unprocessable entity", details?: unknown) {
    super(message, 422, "UNPROCESSABLE_ENTITY", details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests, please try again later", details?: unknown) {
    super(message, 429, "TOO_MANY_REQUESTS", details);
  }
}
