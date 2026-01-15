import type { NextConfig } from "next";
import { execSync } from "child_process";

let commitHash = process.env.AWS_COMMIT_ID;

if (!commitHash) {
  try {
    commitHash = execSync("git rev-parse HEAD").toString().trim();
  } catch {
    commitHash = "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_COMMIT_HASH: commitHash,
  },
};

export default nextConfig;
