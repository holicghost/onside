/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'res.cloudinary.com' },
      { protocol: 'https', hostname: 'd15f34w2p8l1cc.cloudfront.net' },
    ],
  },
};

export default nextConfig;
