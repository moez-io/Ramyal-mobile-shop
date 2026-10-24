import app from "../server/app.js";
import { connect } from "../server/db.js";

let databaseReady;

export default async function handler(request, response) {
  databaseReady ??= connect();
  await databaseReady;
  return app(request, response);
}
