import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { connect, User } from "./db.js";

const rl = createInterface({ input: process.stdin, output: process.stdout });

try {
  await connect();
  const email = (await rl.question("Existing admin email: "))
    .trim()
    .toLowerCase();
  const admin = await User.findOne({ email });

  if (!admin || admin.role !== "admin")
    throw Error("No admin account exists with that email in this database");

  console.log(
    `Database: ${process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : "local SQLite"}`,
  );
  const confirmation = await rl.question(
    `Reset the password for ${admin.email}? Type RESET to continue: `,
  );
  if (confirmation !== "RESET") throw Error("Password reset cancelled");

  console.log(
    "Password input is visible in this terminal. Use a private terminal.",
  );
  const password = await rl.question("New password (12+ characters): ");
  if (password.length < 12)
    throw Error("Password must contain at least 12 characters");

  await User.findByIdAndUpdate(admin._id, {
    password: await bcrypt.hash(password, 12),
  });
  console.log("Admin password updated.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
