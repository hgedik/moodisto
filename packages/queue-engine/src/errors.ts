/** Base class for every rule violation raised by the domain layer. */
export class DomainError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidStateTransitionError extends DomainError {
  public readonly from: string;
  public readonly to: string;

  public constructor(subject: string, from: string, to: string) {
    super('INVALID_STATE_TRANSITION', `${subject} cannot move from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}

export class QueueReorderMismatchError extends DomainError {
  public constructor(message: string) {
    super('QUEUE_REORDER_MISMATCH', message);
  }
}

export class RequestTypeDisabledError extends DomainError {
  public constructor(requestType: string) {
    super('REQUEST_TYPE_DISABLED', `Request type ${requestType} is not available at this venue`);
  }
}
