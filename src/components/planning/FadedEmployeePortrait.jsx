import React from "react";

export default function FadedEmployeePortrait({ photoUrl, name }) {
  if (!photoUrl) return null;

  return (
    <img
      src={photoUrl}
      alt=""
      aria-hidden="true"
      className="pointer-events-none absolute -right-1 -top-1 z-0 h-[82%] w-[58%] object-cover object-top opacity-45 grayscale contrast-110 saturate-0 [mask-image:radial-gradient(ellipse_at_76%_24%,black_0%,black_32%,transparent_76%)] [-webkit-mask-image:radial-gradient(ellipse_at_76%_24%,black_0%,black_32%,transparent_76%)]"
      title={name}
    />
  );
}