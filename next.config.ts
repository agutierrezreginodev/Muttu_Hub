import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config, { dev }) => {
    // The repo lives on /mnt/c (WSL DrvFs), which does not emit inotify
    // events, so the default file watcher never detects changes and HMR
    // appears dead. Polling is the documented workaround for DrvFs.
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
      };
    }
    return config;
  },
};

export default nextConfig;
