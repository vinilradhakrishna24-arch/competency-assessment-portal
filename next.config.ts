import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Default is 1MB. Question Bank images (uploadQuestionImage) are
      // capped client- and server-side at 5MB (MAX_QUESTION_IMAGE_BYTES in
      // src/lib/constants.ts); this just gives the raw multipart request
      // enough headroom to carry one.
      bodySizeLimit: "8mb",
    },
  },
};

export default nextConfig;
