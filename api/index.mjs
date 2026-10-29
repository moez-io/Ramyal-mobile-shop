import app from "../server/app.js";
import { connect } from "../server/db.js";

let databaseReady;

export default async function handler(request, response) {
  databaseReady ??= connect();
  await databaseReady;

  const incomingUrl = new URL(request.url, `https://${request.headers.host}`);
  const apiPath = incomingUrl.searchParams.get("__api_path");
  if (apiPath !== null) {
    incomingUrl.searchParams.delete("__api_path");
    const query = incomingUrl.searchParams.toString();
    request.url = `/api/${apiPath}${query ? `?${query}` : ""}`;
  }

  return app(request, response);
}
