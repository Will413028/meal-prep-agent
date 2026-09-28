import { proxyPython } from "../../../../../server/python-proxy";

export function POST(request: Request) {
  return proxyPython(request, "/api/v1/goals/validate");
}
