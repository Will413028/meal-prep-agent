import { proxyPython } from "../../../server/python-proxy";

export function POST(request: Request) {
  return proxyPython(request, "/agent");
}
