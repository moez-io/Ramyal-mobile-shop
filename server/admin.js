import "dotenv/config";
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { connect, User } from "./db.js";
const rl = createInterface({ input: process.stdin, output: process.stdout });
try {
  await connect();
  const name = await rl.question("Admin name: "),
    email = (await rl.question("Email: ")).trim().toLowerCase();
  console.log(
    "Password input is visible in this terminal. Use a private terminal.",
  );
  const password = await rl.question("Password (12+ characters): ");
  if (password.length < 12 || !email.includes("@") || !name)
    throw Error("Name, email and 12-character password required");
  await User.create({
    name,
    email,
    password: await bcrypt.hash(password, 12),
    role: "admin",
  });
  console.log("Admin created.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
  process.exit(process.exitCode || 0);
}
