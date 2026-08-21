export type ApiResponse<T> =
  | {
      code: number;
      message: "success";
      data: T;
    }
  | {
      code: number;
      message: string;
      data: null;
    };

export function apiSuccess<T>(data: T, status = 200): ApiResponse<T> {
  return { code: status, message: "success", data };
}

export function apiFailure(
  status: number,
  message: string,
): ApiResponse<never> {
  return { code: status, message, data: null };
}
