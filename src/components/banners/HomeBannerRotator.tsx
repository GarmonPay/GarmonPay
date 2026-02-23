"use client";

import { BannerRotator } from "./BannerRotator";

export function HomeBannerRotator() {
  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <BannerRotator placement="homepage" />
    </div>
  );
}
