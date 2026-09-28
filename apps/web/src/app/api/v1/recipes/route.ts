import { proxyPython } from "../../../../server/python-proxy";

export async function GET(request: Request) {
  return proxyPython(request,"/api/v1/recipes");
}
