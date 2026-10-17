import spec from '@taskflow/api-contract/openapi.json';

// Serves the bundled contract at /openapi.json (read by the Swagger UI page).
// No request data is read, so Next prerenders this at build time.
export function GET() {
  return Response.json(spec);
}
