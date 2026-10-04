export type NexusErrorCode =
  | 'INTERNAL_ERROR'
  | 'VALIDATION_ERROR'
  | 'SECURITY_VIOLATION'
  | 'WORKSPACE_ERROR'
  | 'WORKSPACE_NOT_FOUND'
  | 'PATH_TRAVERSAL_DETECTED'
  | 'TOOL_EXECUTION_FAILED'
  | 'TOOL_TIMEOUT'
  | 'COMMAND_REJECTED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_AUTH_FAILED'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_REQUEST_FAILED'
  | 'SESSION_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'TASK_CANCELLED';

export class NexusError extends Error {
  public readonly code: NexusErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly timestamp: number;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    code: NexusErrorCode = 'INTERNAL_ERROR',
    statusCode = 500,
    details?: unknown,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
    this.isOperational = isOperational;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export class SecurityViolationError extends NexusError {
  constructor(message: string, code: NexusErrorCode = 'SECURITY_VIOLATION', details?: unknown) {
    super(message, code, 403, details, true);
  }
}

export class PathTraversalError extends SecurityViolationError {
  constructor(pathAttempted: string) {
    super(`Access denied: path traversal attempt outside workspace boundary: "${pathAttempted}"`, 'PATH_TRAVERSAL_DETECTED');
  }
}

export class ProviderError extends NexusError {
  public readonly provider: string;

  constructor(message: string, provider: string, code: NexusErrorCode = 'PROVIDER_REQUEST_FAILED', statusCode = 502, details?: unknown) {
    super(message, code, statusCode, details, true);
    this.provider = provider;
  }
}

export class ToolExecutionError extends NexusError {
  public readonly toolName: string;

  constructor(toolName: string, message: string, code: NexusErrorCode = 'TOOL_EXECUTION_FAILED', details?: unknown) {
    super(`Tool [${toolName}] failed: ${message}`, code, 400, details, true);
    this.toolName = toolName;
  }
}

export class WorkspaceError extends NexusError {
  constructor(message: string, code: NexusErrorCode = 'WORKSPACE_ERROR', statusCode = 400, details?: unknown) {
    super(message, code, statusCode, details, true);
  }
}

export class ValidationError extends NexusError {
  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, details, true);
  }
}
