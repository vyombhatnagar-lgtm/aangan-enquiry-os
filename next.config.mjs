/** @type {import('next').NextConfig} */
const nextConfig = {
  // knowledge/*.md is read at runtime by the knowledge base loader
  outputFileTracingIncludes: { "/**": ["./knowledge/**/*"] },
  serverExternalPackages: ["pg"],
};
export default nextConfig;
