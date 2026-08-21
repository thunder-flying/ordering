import { apiFailure, apiSuccess, type ApiResponse } from "@ordering/contracts";
import { NextResponse } from "next/server";

export function jsonSuccess<T>(
  data: T,
  init: ResponseInit = {},
): NextResponse<ApiResponse<T>> {
  const status = init.status ?? 200;
  const responseInit = Object.assign({}, init, { status });
  return NextResponse.json(apiSuccess(data, status), responseInit);
}

export function jsonFailure(
  status: number,
  message: string,
  init: ResponseInit = {},
): NextResponse<ApiResponse<never>> {
  const responseInit = Object.assign({}, init, { status });
  return NextResponse.json(apiFailure(status, message), responseInit);
}
