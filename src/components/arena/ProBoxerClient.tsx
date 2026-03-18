"use client";

import dynamic from "next/dynamic";

/** ProBoxer must not SSR (react-three-fiber). Use this import from pages. */
export default dynamic(() => import("./ProBoxer"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        width: "100%",
        height: 400,
        background: "#000000",
        borderRadius: 8,
      }}
      aria-hidden
    />
  ),
});
