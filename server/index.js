import "dotenv/config";
import app from "./app.js";
import { connect } from "./db.js";
await connect();
app.listen(process.env.PORT || 4000, process.env.HOST || "127.0.0.1", () =>
  console.log("Royal Mobile API ready on port " + (process.env.PORT || 4000)),
);
