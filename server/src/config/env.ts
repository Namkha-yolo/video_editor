import fs from "fs";
import path from "path";
import dotenv from "dotenv";

const candidatePaths = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
  path.resolve(process.cwd(), "../../.env"),
];

for (const candidatePath of candidatePaths) {
  if (fs.existsSync(candidatePath)) {
    dotenv.config({ path: candidatePath, override: false });
  }
}
