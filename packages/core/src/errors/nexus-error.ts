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
  | 'NETWORK_ERROR'
  | 'TIMEOUT_ERROR'
  | 'GIT_ERROR'
  | 'MALFORMED_TOOL_CALL'
  | 'SESSION_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'TASK_CANCELLED';

export interface ErrorOptions {
  code?: NexusErrorCode;
  statusCode?: number;
  details?: unknown;
  userReadableMessage?: string;
  recoveryAction?: string;
  correlationId?: string;
  isRetryable?: boolean;
}

export class NexusError extends Error {
  public readonly code: NexusErrorCode;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly timestamp: number;
  public readonly isOperational: boolean;
  public readonly userReadableMessage: string;
  public readonly recoveryAction?: string;
  public correlationId?: string;
  public readonly isRetryable: boolean;

  constructor(
    message: string,
    code: NexusErrorCode = 'INTERNAL_ERROR',
    statusCode = 500,
    details?: unknown,
    isOperational = true,
    userReadableMessage?: string,
    recoveryAction?: string,
    isRetryable = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = Date.now();
    this.isOperational = isOperational;
    this.userReadableMessage = userReadableMessage || message;
    this.recoveryAction = recoveryAction;
    this.isRetryable = isRetryable;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      userReadableMessage: this.userReadableMessage,
      recoveryAction: this.recoveryAction,
      code: this.code,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      correlationId: this.correlationId,
      details: this.details,
      timestamp: this.timestamp,
    };
  }
}

export class SecurityViolationError extends NexusError {
  constructor(message: string, code: NexusErrorCode = 'SECURITY_VIOLATION', details?: unknown) {
    super(
      message,
      code,
      403,
      details,
      true,
      `Security violation: ${message}`,
      'Verify operation adheres to workspace access boundaries and execution safety policies.'
    );
  }
}

export class PathTraversalError extends SecurityViolationError {
  constructor(pathAttempted: string) {
    super(
      `Access denied: path traversal attempt outside workspace boundary: "${pathAttempted}"`,
      'PATH_TRAVERSAL_DETECTED'
    );
  }
}

export class ProviderError extends NexusError {
  public readonly provider: string;

  constructor(
    message: string,
    provider: string,
    code: NexusErrorCode = 'PROVIDER_REQUEST_FAILED',
    statusCode = 502,
    details?: unknown,
    recoveryAction?: string,
    isRetryable = false
  ) {
    super(
      message,
      code,
      statusCode,
      details,
      true,
      `AI Provider (${provider}) error: ${message}`,
      recoveryAction || 'Check your provider configuration and API key status in Provider Setup.',
      isRetryable
    );
    this.provider = provider;
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(provider: string, message = 'Invalid or expired API credentials', details?: unknown) {
    super(
      message,
      provider,
      'PROVIDER_AUTH_FAILED',
      401,
      details,
      `Open Provider Setup and verify the ${provider} API key.`,
      false
    );
  }
}

export class ProviderRateLimitError extends ProviderError {
  public readonly retryAfterMs?: number;

  constructor(provider: string, retryAfterMs = 2000, message = 'Rate limit exceeded', details?: unknown) {
    super(
      message,
      provider,
      'PROVIDER_RATE_LIMIT',
      429,
      details,
      `Rate limit reached for ${provider}. Wait a moment or switch to an alternate provider model.`,
      true
    );
    this.retryAfterMs = retryAfterMs;
  }
}

export class NetworkError extends NexusError {
  constructor(message: string, details?: unknown) {
    super(
      `Network connection failed: ${message}`,
      'NETWORK_ERROR',
      503,
      details,
      true,
      'Network connectivity issue. Please check your internet connection or proxy settings.',
      'Check network connectivity and retry the operation.',
      true
    );
  }
}

export class TimeoutError extends NexusError {
  public readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number, details?: unknown) {
    super(
      `Operation timed out after ${timeoutMs}ms: ${operation}`,
      'TIMEOUT_ERROR',
      408,
      details,
      true,
      `The operation (${operation}) exceeded its timeout limit of ${Math.round(timeoutMs / 1000)}s.`,
      'Consider increasing the timeout limit in Settings or breaking the task into smaller steps.',
      false
    );
    this.timeoutMs = timeoutMs;
  }
}

export class TaskCancelledError extends NexusError {
  constructor(taskId: string, details?: unknown) {
    super(
      `Task ${taskId} was cancelled`,
      'TASK_CANCELLED',
      499,
      details,
      true,
      'The running task was cancelled.',
      'You can launch a new task or prompt the agent with adjusted instructions.',
      false
    );
  }
}

export class ToolExecutionError extends NexusError {
  public readonly toolName: string;

  constructor(
    toolName: string,
    message: string,
    code: NexusErrorCode = 'TOOL_EXECUTION_FAILED',
    details?: unknown,
    recoveryAction?: string,
    isRetryable = false
  ) {
    super(
      `Tool [${toolName}] failed: ${message}`,
      code,
      400,
      details,
      true,
      `Tool execution failed: ${message}`,
      recoveryAction || `Verify input parameters for tool '${toolName}'.`,
      isRetryable
    );
    this.toolName = toolName;
  }
}

export class MalformedToolCallError extends ToolExecutionError {
  constructor(toolName: string, rawInput: unknown, errorMsg: string) {
    super(
      toolName,
      `Malformed arguments: ${errorMsg}`,
      'MALFORMED_TOOL_CALL',
      { rawInput },
      'The model produced arguments that did not match the expected JSON schema. Retrying with corrected schema.',
      true
    );
  }
}

export class GitOperationError extends NexusError {
  constructor(message: string, details?: unknown) {
    super(
      `Git operation failed: ${message}`,
      'GIT_ERROR',
      400,
      details,
      true,
      `Git command failed: ${message}`,
      'Ensure git is installed and workspace is an initialized repository with committed history.',
      false
    );
  }
}

export class WorkspaceError extends NexusError {
  constructor(message: string, code: NexusErrorCode = 'WORKSPACE_ERROR', statusCode = 400, details?: unknown) {
    super(
      message,
      code,
      statusCode,
      details,
      true,
      `Workspace error: ${message}`,
      'Ensure the workspace directory exists, is accessible, and has valid permissions.'
    );
  }
}

export class ValidationError extends NexusError {
  constructor(message: string, details?: unknown) {
    super(
      message,
      'VALIDATION_ERROR',
      400,
      details,
      true,
      `Validation error: ${message}`,
      'Please check your input values and try again.'
    );
  }
}
