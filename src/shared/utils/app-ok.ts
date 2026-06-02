import type { ControllerResult } from "./controller.js";

/**
 * Helper to build success responses with correct 2xx status codes.
 * Use in controllers: return AppOk.created({ data: newUser });
 */
export class AppOk {
  static ok<T>(result: Omit<ControllerResult<T>, "statusCode"> = {}): ControllerResult<T> {
    return { statusCode: 200, ...result };
  }

  static created<T>(result: Omit<ControllerResult<T>, "statusCode"> = {}): ControllerResult<T> {
    return { statusCode: 201, ...result };
  }

  static accepted<T>(result: Omit<ControllerResult<T>, "statusCode"> = {}): ControllerResult<T> {
    return { statusCode: 202, ...result };
  }

  static noContent(): ControllerResult {
    return { statusCode: 204 };
  }
}
